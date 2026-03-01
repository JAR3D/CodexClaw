// Fila por canal para evitar concorrência (mensagens em sequência no mesmo canal)
const channelQueues = new Map();

export function enqueueByChannel(channelId, task) {
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

export function splitIntoChunks(text, maxLen = 1800) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    // tenta cortar num limite "bonito" (quebra de linha) perto do maxLen
    const end = Math.min(i + maxLen, text.length);
    let sliceEnd = end;

    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end);
      if (lastNewline > i + Math.floor(maxLen * 0.6)) {
        sliceEnd = lastNewline;
      }
    }

    chunks.push(text.slice(i, sliceEnd));
    i = sliceEnd;
  }

  return chunks;
}