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
