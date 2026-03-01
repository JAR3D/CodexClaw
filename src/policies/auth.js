export function isAllowedMessage(message, { allowedChannelId, allowedUserId, botUser }) {
  if (message.author.bot) return false;
  if (message.channel.id !== allowedChannelId) return false;
  if (message.author.id !== allowedUserId) return false;
  if (!message.mentions.has(botUser)) return false;
  return true;
}