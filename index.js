import "dotenv/config";

import { Client, GatewayIntentBits, Events } from "discord.js";
import { getSession, saveSession } from "./db";
import { startNewThread, resumeThread } from "./codexClient";

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

    // UX: indicar que está a “pensar”
    await message.channel.sendTyping();

    // Sessão por canal (podes mudar para sessão por user mais tarde)
    const channelId = message.channel.id;

    let threadId = getSession(channelId);
    let thread;

    if (threadId) {
      thread = resumeThread(threadId);
    } else {
      thread = startNewThread();
      // O SDK persiste threads; precisamos do ID para recuperar depois.
      // Normalmente o thread tem uma propriedade id; se não tiver, vamos ajustar no próximo passo.
      threadId = thread.id;
      saveSession(channelId, threadId);
      console.log(`🧠 Nova thread criada: ${threadId}`);
    }

    const turn = await thread.run(cleanedContent);

    const replyText = (turn.finalResponse || "").trim();
    const safeReply =
      replyText.length > 0 ? replyText : "(Sem resposta do Codex)";

    // Discord tem limite ~2000 chars. Vamos cortar no MVP.
    const truncated =
      safeReply.length > 1800 ? safeReply.slice(0, 1800) + "…" : safeReply;

    await message.reply(truncated);
  } catch (err) {
    console.error("Erro no handler:", err);
    await message.reply("⚠️ Deu erro do meu lado. Vê os logs na VPS.");
  }
});

client.login(DISCORD_BOT_TOKEN);