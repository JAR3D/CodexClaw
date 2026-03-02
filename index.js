import "dotenv/config";

import { Client, GatewayIntentBits, Events } from "discord.js";
import { getCodexEngine } from "./src/engine/codexEngine.js";
import { log } from "./lib.js";
import { isAllowedMessage } from "./src/policies/auth.js";
import { createChannelCooldown } from "./src/policies/rateLimit.js";
import { createChannelQueue } from "./src/policies/concurrency.js";
import { handleMessage } from "./src/orchestrator/handleMessage.js";
import { createSessionsRepo } from "./src/store/sessionsRepo.js";
import { createMemoriesRepo } from "./src/store/memoriesRepo.js";

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
const cooldown = createChannelCooldown({ cooldownMs: 3000 });
const queue = createChannelQueue();
const sessionsRepo = createSessionsRepo();
const memoriesRepo = createMemoriesRepo();

client.on(Events.MessageCreate, async (message) => {
  try {
    if (
      !isAllowedMessage(message, {
        allowedChannelId: ALLOWED_CHANNEL_ID,
        allowedUserId: ALLOWED_USER_ID,
        botUser: client.user,
      })
    ) return;

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

    const cd = cooldown.hit(channelId);
    if (!cd.ok) {
      await message.reply("Espera 3s antes de fazer outro pedido 🙂");
      return;
    }

    await handleMessage({
      message,
      cleanedContent,
      engine,
      queue,
      log,
      sessionsRepo,
      memoriesRepo,
    })
  } catch (err) {
    console.error("Erro no handler (outer):", err);
    await message.reply("⚠️ Deu erro do meu lado. Vê os logs na VPS.");
  }
});

client.login(DISCORD_BOT_TOKEN);