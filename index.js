import crypto from "node:crypto";
import "dotenv/config";

import { Client, GatewayIntentBits, Events } from "discord.js";
import { getSession, saveSession } from "./db.js";
import { getCodexEngine } from "./src/engine/codexEngine.js";
import { splitIntoChunks, enqueueByChannel, isOnCooldown, log } from "./lib.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const { DISCORD_BOT_TOKEN, ALLOWED_USER_ID, ALLOWED_CHANNEL_ID } = process.env;

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

const engine = getCodexEngine();

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    // Só permitir o canal configurado
    if (message.channel.id !== ALLOWED_CHANNEL_ID) return;

    // Só permitir o teu user
    if (message.author.id !== ALLOWED_USER_ID) return;

    // Só responder se for mencionado
    if (!message.mentions.has(client.user)) return;

    // Remove o mention do texto
    const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*`);
    const cleanedContent = message.content.replace(mentionRegex, "").trim();

    if (!cleanedContent) {
      await message.reply("Escreve uma mensagem depois do mention 🙂");
      return;
    }

    console.log(`Mensagem recebida: ${cleanedContent}`);

    // Sessão por canal (podes mudar para sessão por user mais tarde)
    const channelId = message.channel.id;

    if (isOnCooldown(channelId)) {
      await message.reply("Espera 3s antes de fazer outro pedido 🙂");
      return;
    }

    await enqueueByChannel(channelId, async () => {
      const runId = crypto.randomUUID();
      const t0 = Date.now();

      let threadId = null;
      let thread = null;

      try {
        log("run_start", {
          runId,
          channelId,
          userId: message.author.id,
          messageId: message.id,
        });

        // UX: indicar que está a “pensar” (1x por mensagem na fila)
        await message.channel.sendTyping();

        threadId = getSession(channelId);

        thread = engine.getThread(threadId);
        if (!threadId) {
          console.log("🧠 Thread nova criada (ainda sem id persistido)");
        }

        const turn = await thread.run(cleanedContent);

        log("run_done", {
          runId,
          channelId,
          threadId: thread._id || null,
          durationMs: Date.now() - t0,
          responseChars: (turn.finalResponse || "").length,
        });

        // Importante: este save agora acontece dentro da fila -> evita race no 1º save
        if (!threadId && thread._id) {
          saveSession(channelId, thread._id);
          console.log(`💾 Thread id guardado: ${thread._id}`);
        }

        const replyText = (turn.finalResponse || "").trim();
        const safeReply =
          replyText.length > 0 ? replyText : "(Sem resposta do Codex)";

        // Discord tem limite ~2000 chars.
        const chunks = splitIntoChunks(safeReply, 1800);

        // primeira resposta como reply à mensagem original
        await message.reply(chunks[0]);

        // restantes chunks como mensagens normais no canal
        for (let i = 1; i < chunks.length; i++) {
          await message.channel.send(chunks[i]);
        }
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
          // ignora erros de reply (ex: mensagem apagada / permissões)
        }
      }
    });
  } catch (err) {
    console.error("Erro no handler (outer):", err);
    await message.reply("⚠️ Deu erro do meu lado. Vê os logs na VPS.");
  }
});

client.login(DISCORD_BOT_TOKEN);