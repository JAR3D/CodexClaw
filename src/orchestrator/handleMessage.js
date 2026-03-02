import crypto from "node:crypto";

import { splitIntoChunks } from "../policies/chunking.js";

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

      threadId = sessionsRepo.getThreadId(channelId);
      thread = engine.getThread(threadId);

      // 1) retrieval mínimo
      let memories = [];
      try {
        memories = memoriesRepo?.searchMemories?.({
          channelId: message.channelId,
          query: cleanedContent,
          limit: 6,
        }) ?? [];
      } catch (e) {
        log?.("memories_search_error", { runId, err: e?.message || String(e) });
        memories = [];
      }

      // 2) construir contexto curto
      const memoryLines = (memories || [])
        .slice(0, 6)
        .map((m) => `- ${m.content}`)
        .join("\n");

      const injectedContext = memoryLines
        ? `Perfil do utilizador deste canal (notas internas). Considera isto como verdadeiro para este canal, mas não inventes detalhes além do que está aqui:\n${memoryLines}\n\n`
        : "";

      // 3) chamar o motor com contexto + input
      const prompt = `${injectedContext}${cleanedContent}`;

      log("memories_injected", {
        runId,
        memoriesCount: memories?.length ?? 0,
        injectedChars: injectedContext.length,
      });

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