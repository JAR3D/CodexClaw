export function log(event, payload = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));
}

export function dedupeById(arr) {
  const seen = new Set();
  return (arr || []).filter((m) => {
    if (!m?.id) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
};

export function requireEnv(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Falta variável obrigatória no .env: ${name}`);
  }
}