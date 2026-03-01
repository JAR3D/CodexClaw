export function createChannelCooldown({ cooldownMs }) {
  const lastRequestAtByChannel = new Map();

  function hit(channelId) {
    const now = Date.now();
    const last = lastRequestAtByChannel.get(channelId) || 0;
    if (now - last < cooldownMs) return { ok: false, waitMs: cooldownMs - (now - last) };
    lastRequestAtByChannel.set(channelId, now);
    return { ok: true, waitMs: 0 };
  }

  return { hit };
}