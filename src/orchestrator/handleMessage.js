import crypto from "node:crypto";

import { splitIntoChunks } from "../policies/chunking.js";
import { tryHandleMemoryCommand } from "./commands/memoryCommands.js";
import { buildPromptMemoriesContext } from "./promptMemories.js";

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

      const handled = await tryHandleMemoryCommand({
        cleanedContent, 
        channelId, 
        message, 
        memoriesRepo, 
        log, 
        runId
      });
      if (handled) return;

      threadId = sessionsRepo.getThreadId(channelId);
      thread = engine.getThread(threadId);

      const retrievalQuery = cleanedContent?.trim() || message.content?.trim() || "";

      const { injectedContext } = buildPromptMemoriesContext({
        channelId,
        cleanedContent: retrievalQuery,
        memoriesRepo,
        log,
        runId,
      });

      const normalizedInput = String(cleanedContent || "")
        .replace(/\s+/g, " ")
        .trim();

      const prompt = `${injectedContext}${normalizedInput}`;

      const turn = await thread.run(prompt);

      if (!threadId && thread._id) {
        sessionsRepo.setThreadId(channelId, thread._id);
      }

      const replyText = (turn.finalResponse || "").trim();
      const safeReply = replyText.length > 0 ? replyText : "(Sem resposta do Codex)";

      const chunks = splitIntoChunks(safeReply, 1800);

      const nonEmptyChunks = chunks.filter((c) => String(c).trim().length > 0);
      if (nonEmptyChunks.length === 0) {
        await message.reply("(Sem resposta do Codex)");
        return;
      }

      await message.reply(nonEmptyChunks[0]);
      for (let i = 1; i < nonEmptyChunks.length; i++) {
        await message.channel.send(nonEmptyChunks[i]);
      }

      log("run_done", {
        runId,
        channelId,
        threadId: thread?._id || null,
        durationMs: Date.now() - t0,
        responseChars: safeReply.length,
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
        if (message?.channel) {
          await message.reply("⚠️ Deu erro do meu lado. Vê os logs na VPS.");
        }
      } catch {
        log("run_error_reply_failed", {
          runId,
          channelId,
          error: replyErr?.message || String(replyErr),
        });
      }
    }
  });
}