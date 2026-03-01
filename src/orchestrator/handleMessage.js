import crypto from "node:crypto";
import { getSession, saveSession } from "../../db.js";

function splitIntoChunks(text, maxLen = 1800) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    // tenta cortar num limite "bonito" (quebra de linha) perto do maxLen
    const end = Math.min(i + maxLen, text.length);
    let sliceEnd = end;

    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end);
      if (lastNewline > i + Math.floor(maxLen * 0.6)) {
        sliceEnd = lastNewline;
      }
    }

    chunks.push(text.slice(i, sliceEnd));
    i = sliceEnd;
  }

  return chunks;
}

export async function handleMessage({ message, engine, queue, log }) {
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

      threadId = getSession(channelId);
      thread = engine.getThread(threadId);

      const turn = await thread.run(message.__cleanedContent);

      if (!threadId && thread._id) {
        saveSession(channelId, thread._id);
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