import crypto from "node:crypto";

import { splitIntoChunks } from "../policies/chunking.js";
import { dedupeById } from "../../lib.js";

export async function handleMessage({ message, cleanedContent, engine, queue, log, sessionsRepo, memoriesRepo }) {
  const channelId = message.channel.id;

  await queue.enqueue(channelId, async () => {
    const runId = crypto.randomUUID();
    const t0 = Date.now();
    let threadId = null;
    let thread = null;

    log("run_start", {
      runId,
      channelId,
      userId: message.author.id,
      messageId: message.id,
    });

    try {
      await message.channel.sendTyping();

      // COMMAND: mem ls [kind] [n]
      // exemplos:
      //   mem ls
      //   mem ls fact
      //   mem ls fact 5
      const memLsMatch = cleanedContent.match(
        /^mem\s+ls(?:\s+(prefs|fact|note|task))?(?:\s+(\d+))?$/i
      );
      if (memLsMatch) {
        const kind = memLsMatch[1]?.toLowerCase() || null;
        const nRaw = memLsMatch[2] ? parseInt(memLsMatch[2], 10) : 5;
        const limit = Math.min(Math.max(nRaw || 5, 1), 15);

        let rows = [];
        if (kind) {
          rows = memoriesRepo.getMemoriesByKind({ channelId, kind, limit });
        } else {
          // sem kind: usa searchMemories com query vazia (vai devolver note/fact por causa do filtro)
          rows = memoriesRepo.searchMemories({ channelId, query: "", limit });
        }

        if (!rows || rows.length === 0) {
          await message.reply("ℹ️ Sem memórias para mostrar.");
          return;
        }

        const lines = rows.map((m) => `#${m.id} [${m.kind}] ${m.content}`).join("\n");
        await message.reply(`🧠 Últimas memórias:\n${lines}`);
        return;
      }

      // COMMAND: mem (guardar memória manualmente)
      // formato: "mem <kind> <conteúdo>"
      const memMatch = cleanedContent.match(/^mem\s+(prefs|fact|note|task)\s+(.+)$/i);
      if (memMatch) {
        const kind = memMatch[1].toLowerCase();
        const content = memMatch[2].trim();

        const id = memoriesRepo.addMemory({ channelId, kind, content, salience: 1.0 });

        log("memory_added", { runId, channelId, kind, id });

        await message.reply(`✅ Memória guardada (${kind}) #${id}`);
        return;
      }

      threadId = sessionsRepo.getThreadId(channelId);
      thread = engine.getThread(threadId);

      // 1) prefs always-on + retrieval FTS
      let prefs = [];
      try {
        prefs =
          memoriesRepo?.getMemoriesByKind?.({
            channelId,
            kind: "prefs",
            limit: 6,
          }) ?? [];
      } catch (e) {
        log?.("prefs_fetch_error", { runId, err: e?.message || String(e) });
        prefs = [];
      }

      let retrieved = [];
      try {
        retrieved =
          memoriesRepo?.searchMemories?.({
            channelId,
            query: cleanedContent,
            limit: 6,
          }) ?? [];
      } catch (e) {
        log?.("memories_search_error", { runId, err: e?.message || String(e) });
        retrieved = [];
      }

      // 2) hard rule: prefs sempre primeiro; facts/notes só completam até ao limite
      const prefsUnique = dedupeById(prefs);
      const factsUnique = dedupeById(retrieved);

      const MAX_LINES = 6;
      const remainingForFacts = Math.max(0, MAX_LINES - prefsUnique.length);

      // Só tocamos / injectamos o que realmente entra no prompt
      const injectedMemories = [
        ...prefsUnique,
        ...factsUnique.slice(0, remainingForFacts),
      ];

      // 2.1) touch das memórias efectivamente injectadas
      let touchedCount = 0;
      try {
        if (injectedMemories.length > 0 && memoriesRepo?.touchMemories) {
          const ids = injectedMemories.map((m) => m.id).filter(Boolean);
          touchedCount = memoriesRepo.touchMemories({ ids }) ?? 0;
        }
      } catch (e) {
        log?.("memories_touch_error", { runId, err: e?.message || String(e) });
      }

      // 2.2) logs de debugging (ordem real injectada)
      log("memories_selected", {
        runId,
        memories: injectedMemories.map((m) => ({
          id: m.id,
          kind: m.kind,
          last_used_at: m.last_used_at ?? null,
          created_at: m.created_at ?? null,
          salience: m.salience ?? null,
          preview: (m.content || "").slice(0, 80),
        })),
      });

      const memoryLines = injectedMemories
        .map((m) => `- ${m.content}`)
        .join("\n");

      const injectedContext = memoryLines
        ? `Perfil do utilizador deste canal (notas internas). Considera isto como verdadeiro para este canal, mas não inventes detalhes além do que está aqui:\n${memoryLines}\n\n`
        : "";

      log("memories_injected", {
        runId,
        prefsCount: prefsUnique.length,
        retrievedCount: factsUnique.length,
        injectedCount: injectedMemories.length,
        touchedCount,
        injectedChars: injectedContext.length,
      });

      // 3) chamar o motor com contexto + input
      const prompt = `${injectedContext}${cleanedContent}`;

      const turn = await thread.run(prompt);

      if (!threadId && thread._id) {
        sessionsRepo.setThreadId(channelId, thread._id);
      }

      const replyText = (turn.finalResponse || "").trim();
      const safeReply = replyText.length > 0 ? replyText : "(Sem resposta do Codex)";

      const chunks = splitIntoChunks(safeReply, 1800);

      await message.reply(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await message.channel.send(chunks[i]);
      }

      log("run_done", {
        runId,
        channelId,
        threadId: thread?._id || null,
        durationMs: Date.now() - t0,
        responseChars: replyText.length,
      });
    } catch (err) {
      log("run_error", {
        runId,
        channelId,
        threadId: thread?._id || threadId || null,
        durationMs: Date.now() - t0,
        error: err?.message || String(err),
      });

      try {
        await message.reply("⚠️ Deu erro do meu lado. Vê os logs na VPS.");
      } catch {
        // ignora
      }
    }
  });
}