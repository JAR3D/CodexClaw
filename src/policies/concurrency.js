export function createChannelQueue() {
  const channelQueues = new Map();

  function enqueue(channelId, task) {
    const prev = channelQueues.get(channelId) || Promise.resolve();

    const next = prev.then(task);

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

  return { enqueue };
}