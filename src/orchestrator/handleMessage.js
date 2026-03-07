import { splitIntoChunks } from "../policies/chunking.js";
import { tryHandleMemoryCommand } from "./commands/memoryCommands.js";
import { buildPromptMemoriesContext } from "./promptMemories.js";

export async function handleMessage({ 
  message, 
  cleanedContent, 
  engine, 
  queue, 
  log, 
  sessionsRepo, 
  memoriesRepo, 
  runId 
}) {
  const channelId = message.channel.id;

  await queue.enqueue(channelId, async () => {
    const t0 = Date.now();
    let threadId = null;
    let thread = null;

    log("run_start", {
      runId,
      channelId,
      userId: message.author.id,
      messageId: message.id,
      isMemoryCommand: /^mem\b/i.test(cleanedContent || ""),
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

      if (handled) {
        log("memory_command_handled", {
          runId,
          channelId,
          userId: message.author.id,
          messageId: message.id,
        });
        return;
      }

      threadId = sessionsRepo.getThreadId(channelId);
      thread = engine.getThread(threadId);

      if (threadId) {
        log("session_thread_reused", {
          runId,
          channelId,
          threadId,
        });
      }

      const retrievalQuery = cleanedContent?.trim() || message.content?.trim() || "";

      const tMem0 = Date.now();

      const { injectedContext } = buildPromptMemoriesContext({
        channelId,
        cleanedContent: retrievalQuery,
        memoriesRepo,
        log,
        runId,
      });

      const memoryBuildMs = Date.now() - tMem0;

      const normalizedInput = String(retrievalQuery || "")
        .replace(/\s+/g, " ")
        .trim();

      const prompt = `${injectedContext}${normalizedInput}`;

      const tRun0 = Date.now();
      const turn = await thread.run(prompt);
      const engineRunMs = Date.now() - tRun0;

      if (threadId && thread?._id && thread._id !== threadId) {
        log("session_thread_mismatch", {
          runId,
          channelId,
          expectedThreadId: threadId,
          actualThreadId: thread._id,
        });
      }

      if (!threadId && thread._id) {
        sessionsRepo.setThreadId(channelId, thread._id);
        log("session_thread_created", {
          runId,
          channelId,
          threadId: thread._id,
        });
      }

      const replyText = (turn.finalResponse || "").trim();
      const safeReply = replyText.length > 0 ? replyText : "(Sem resposta do Codex)";

      const chunks = splitIntoChunks(safeReply, 1800);

      const nonEmptyChunks = chunks.filter((c) => String(c).trim().length > 0);
      if (nonEmptyChunks.length === 0) {
        await message.reply("(Sem resposta do Codex)");
        return;
      }

      if (nonEmptyChunks.length > 8) {
        log("large_response_detected", {
          runId,
          channelId,
          chunks: nonEmptyChunks.length,
          responseChars: safeReply.length,
        });
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
        memoryBuildMs,
        engineRunMs,
        promptChars: prompt.length,
        chunksSent: nonEmptyChunks.length,
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
      } catch (replyErr) {
        log("run_error_reply_failed", {
          runId,
          channelId,
          error: replyErr?.message || String(replyErr),
        });
      }
    }
  });
}