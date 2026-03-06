export function isAllowedMessage(message, { allowedChannelId, allowedUserId, botUser }) {
  if (message.author.bot) return false;
  if (message.channel.id !== allowedChannelId) return false;
  if (message.author.id !== allowedUserId) return false;
  
  const mentionAtStart = new RegExp(`^<@!?${botUser.id}>(\\s|$)`);
  if (!mentionAtStart.test(message.content || "")) return false;

  return true;
}