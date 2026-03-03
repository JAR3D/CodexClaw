import Database from "better-sqlite3";

const db = new Database("codexclaw.db");

// Criar tabela se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    channel_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL
  );
`);

export function getSession(channelId) {
  const row = db.prepare(
    'SELECT thread_id FROM sessions WHERE channel_id = ?'
  ).get(channelId);

  return row ? row.thread_id : null;
}

export function saveSession(channelId, threadId) {
  db.prepare(`
    INSERT INTO sessions (channel_id, thread_id)
    VALUES (?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET thread_id=excluded.thread_id
  `).run(channelId, threadId);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note',
    content TEXT NOT NULL,
    salience REAL NOT NULL DEFAULT 1.0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_memories_channel_created
    ON memories(channel_id, created_at DESC);

  -- FTS5 index (contentless table linked to memories)
  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts
    USING fts5(content, content='memories', content_rowid='id');

  -- Keep FTS in sync
  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.id, old.content);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content)
    VALUES ('delete', old.id, old.content);
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END;
`);

export function addMemory({ channelId, kind = "note", content, salience = 1.0 }) {
  const stmt = db.prepare(`
    INSERT INTO memories (channel_id, kind, content, salience)
    VALUES (?, ?, ?, ?)
  `);

  const info = stmt.run(channelId, kind, content, salience);
  return info.lastInsertRowid;
}

export function searchMemories({ channelId, query, limit = 6 }) {
  const qRaw = (query || "").trim();

  if (!qRaw) {
    return db.prepare(`
      SELECT id, kind, content, salience, created_at, last_used_at
      FROM memories
      WHERE channel_id = ?
        AND kind != 'prefs'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(channelId, limit);
  }

  // Normaliza hífens para espaços e tokeniza
  const normalized = qRaw.replace(/[-–—]/g, " ");
  const tokens = Array.from(
    new Set(
      normalized
        .toLowerCase()
        .split(/[^a-z0-9À-ÿ]+/i)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3)
    )
  ).slice(0, 8);

  if (tokens.length === 0) {
    return [];
  }

  // FTS5 query segura: "token" AND "token2" ...
  const ftsQuery = tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" OR ");

  return db.prepare(`
    SELECT m.id, m.kind, m.content, m.salience, m.created_at, m.last_used_at,
           bm25(memories_fts) AS score
    FROM memories_fts
    JOIN memories m ON m.id = memories_fts.rowid
    WHERE memories_fts MATCH ?
      AND m.channel_id = ?
      AND m.kind != 'prefs'
    ORDER BY score
    LIMIT ?
  `).all(ftsQuery, channelId, limit);
}

export function getMemoriesByKind({ channelId, kind, limit = 10 }) {
  return db
    .prepare(
      `
      SELECT
        id,
        channel_id,
        kind,
        content,
        created_at,
        last_used_at,
        salience
      FROM memories
      WHERE channel_id = ? AND kind = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(channelId, kind, limit);
}

export function touchMemories({ ids }) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (list.length === 0) return 0;

  const now = Math.floor(Date.now() / 1000);

  const stmt = db.prepare(`
    UPDATE memories
    SET last_used_at = ?
    WHERE id = ?
  `);

  const tx = db.transaction((memoryIds) => {
    let updated = 0;
    for (const id of memoryIds) {
      const info = stmt.run(now, id);
      updated += info.changes || 0;
    }
    return updated;
  });

  return tx(list);
}