import "dotenv/config";

import { Client, GatewayIntentBits, Events } from "discord.js";
import { getSession, saveSession } from "./db.js";
import { startNewThread, resumeThread } from "./codexClient.js";

// Fila por canal para evitar concorrência (mensagens em sequência no mesmo canal)
const channelQueues = new Map();

function enqueueByChannel(channelId, task) {
  const prev = channelQueues.get(channelId) || Promise.resolve();

  // Encadeia a tarefa na fila existente
  const next = prev.then(task);

  // Guarda o novo "tail" da fila e limpa quando terminar
  channelQueues.set(
    channelId,
    next.finally(() => {
      if (channelQueues.get(channelId) === next) {
        channelQueues.delete(channelId);
      }
    })
  );

  return next;
}

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
    const cleanedContent = message.content.replace(
      `<@${client.user.id}>`,
      ""
    ).trim();

    if (!cleanedContent) {
      await message.reply("Escreve uma mensagem depois do mention 🙂");
      return;
    }

    console.log(`Mensagem recebida: ${cleanedContent}`);

    // Sessão por canal (podes mudar para sessão por user mais tarde)
    const channelId = message.channel.id;

    await enqueueByChannel(channelId, async () => {
      try {
        // UX: indicar que está a “pensar” (1x por mensagem na fila)
        await message.channel.sendTyping();

        let threadId = getSession(channelId);
        let thread;

        if (threadId) {
          thread = resumeThread(threadId);
        } else {
          thread = startNewThread();
          console.log("🧠 Thread nova criada (ainda sem id persistido)");
        }

        const turn = await thread.run(cleanedContent);

        // Importante: este save agora acontece dentro da fila -> evita race no 1º save
        if (!threadId && thread._id) {
          saveSession(channelId, thread._id);
          console.log(`💾 Thread id guardado: ${thread._id}`);
        }

        const replyText = (turn.finalResponse || "").trim();
        const safeReply =
          replyText.length > 0 ? replyText : "(Sem resposta do Codex)";

        // Discord tem limite ~2000 chars. Vamos cortar no MVP.
        const truncated =
          safeReply.length > 1800 ? safeReply.slice(0, 1800) + "…" : safeReply;

        await message.reply(truncated);
      } catch (err) {
        console.error("Erro no handler (fila):", err);
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