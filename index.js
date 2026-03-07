import "dotenv/config";

import { acquireProcessLock } from "./src/runtime/processLock.js";

acquireProcessLock();

import { Client, GatewayIntentBits, Events } from "discord.js";
import { getCodexEngine } from "./src/engine/codexEngine.js";
import { log, requireEnv, requireDiscordSnowflake } from "./lib.js";
import { isAllowedMessage } from "./src/policies/auth.js";
import { createChannelCooldown } from "./src/policies/rateLimit.js";
import { createChannelQueue } from "./src/policies/concurrency.js";
import { handleMessage } from "./src/orchestrator/handleMessage.js";
import { createSessionsRepo } from "./src/store/sessionsRepo.js";
import { createMemoriesRepo } from "./src/store/memoriesRepo.js";

process.on("uncaughtException", (err) => {
  log("uncaught_exception", {
    error: err?.message || String(err),
    stack: err?.stack || null,
  });
});

process.on("unhandledRejection", (reason) => {
  log("unhandled_rejection", {
    error: reason?.message || String(reason),
    reasonType: typeof reason,
  });
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const { DISCORD_BOT_TOKEN, ALLOWED_USER_ID, ALLOWED_CHANNEL_ID } = process.env;

requireEnv("DISCORD_BOT_TOKEN", DISCORD_BOT_TOKEN);
const allowedUserId = requireDiscordSnowflake("ALLOWED_USER_ID", ALLOWED_USER_ID);
const allowedChannelId = requireDiscordSnowflake("ALLOWED_CHANNEL_ID", ALLOWED_CHANNEL_ID);

client.once(Events.ClientReady, () => {
  log("discord_ready", {
    botUserId: client.user?.id,
    botTag: client.user?.tag,
  });
});

const engine = getCodexEngine();
const cooldown = createChannelCooldown({ cooldownMs: 3000 });
const queue = createChannelQueue();
const sessionsRepo = createSessionsRepo();
const memoriesRepo = createMemoriesRepo();

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!client.user) {
      return;
    }

    if (
      !isAllowedMessage(message, {
        allowedChannelId,
        allowedUserId,
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

    log("message_received", {
      channelId: message.channel.id,
      userId: message.author.id,
      messageId: message.id,
      chars: cleanedContent.length,
    });

    // Sessão por canal (podes mudar para sessão por user mais tarde)
    const channelId = message.channel.id;

    const cd = cooldown.hit(channelId);
    if (!cd.ok) {
      const waitSec = Math.max(1, Math.ceil((cd.waitMs || 0) / 1000));
      await message.reply(`Espera ${waitSec}s antes de fazer outro pedido 🙂`);
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
    log("outer_handler_error", {
      channelId: message?.channel?.id,
      messageId: message?.id,
      error: err?.message || String(err),
    });
    
    try {
      await message.reply("⚠️ Deu erro do meu lado. Vê os logs na VPS.");
    } catch (replyErr) {
      log("outer_error_reply_failed", {
        channelId: message?.channel?.id,
        messageId: message?.id,
        error: replyErr?.message || String(replyErr),
      });
    }
  }
});

client.login(DISCORD_BOT_TOKEN).catch((err) => {
  log("discord_login_failed", {
    error: err?.message || String(err),
  });
  process.exit(1);
});