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