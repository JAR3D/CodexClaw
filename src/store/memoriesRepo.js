import {
  addMemory,
  searchMemories as dbSearchMemories,
  getMemoriesByKind,
  touchMemories,
  deleteMemory,
  setMemorySalience,
} from "../../db.js";

function rankMemories(rows, { limit = 6 }) {
  const now = Math.floor(Date.now() / 1000);

  const scored = (rows || []).map((m) => {
    // bm25: quanto menor melhor -> convertemos para "maior melhor"
    const bm25Score = typeof m.score === "number" ? m.score : null;
    const textRelevance = bm25Score === null ? 0 : -bm25Score;

    // recência: usa last_used_at se existir, senão created_at
    const ts = m.last_used_at ?? m.created_at ?? now;
    const ageDays = Math.max(0, (now - ts) / 86400);
    const recency = 1 / (1 + ageDays); // 1.0 hoje, vai decaindo

    const salience = typeof m.salience === "number" ? m.salience : 1.0;

    // pesos simples (ajustamos depois)
    const finalScore = textRelevance + 0.6 * recency + 0.2 * salience;

    return { ...m, _finalScore: finalScore };
  });

  scored.sort((a, b) => b._finalScore - a._finalScore);

  return scored.slice(0, limit).map(({ _finalScore, ...rest }) => rest);
}

export function createMemoriesRepo() {
  return {
    addMemory,
    getMemoriesByKind,
    touchMemories,
    deleteMemory,
    setMemorySalience,

    searchMemories: ({ channelId, query, limit = 6 }) => {
      // oversample para ter margem de ranking
      const oversample = Math.max(limit * 4, 20);

      const rows = dbSearchMemories({ channelId, query, limit: oversample });
      return rankMemories(rows, { limit });
    },
  };
}