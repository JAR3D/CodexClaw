require('dotenv').config();

const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const {
  DISCORD_BOT_TOKEN,
  ALLOWED_USER_ID,
  ALLOWED_CHANNEL_ID
} = process.env;

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Ignorar mensagens do próprio bot
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
    ''
  ).trim();

  console.log(`Mensagem recebida: ${cleanedContent}`);

  await message.reply(`👋 Recebi: "${cleanedContent}"`);
});

client.login(DISCORD_BOT_TOKEN);
