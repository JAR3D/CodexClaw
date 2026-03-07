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

export function requireDiscordSnowflake(name, value) {
  requireEnv(name, value);
  const v = String(value).trim();

  // Snowflake Discord: inteiro positivo longo (tipicamente 17-20 dígitos)
  if (!/^\d{17,20}$/.test(v)) {
    throw new Error(`Valor inválido para ${name}: esperado Discord snowflake (17-20 dígitos)`);
  }

  return v;
}
