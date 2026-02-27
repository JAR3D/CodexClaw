import "dotenv/config";
import { Codex } from "@openai/codex-sdk";

const { CODEX_API_KEY } = process.env;

if (!CODEX_API_KEY) {
  throw new Error("Falta CODEX_API_KEY no .env");
}

// Instância global do Codex (reutilizada)
const codex = new Codex({
  apiKey: CODEX_API_KEY,
});

export function startNewThread() {
  // Para MVP: seguro e não-interativo.
  // read-only + sem aprovações evita “ficar preso” a pedir confirmação.
  return codex.startThread({
    skipGitRepoCheck: true,
    workingDirectory: process.cwd(),
    sandboxMode: "read-only",
    approvalPolicy: "never",
    networkAccessEnabled: false,
  });
}

export function resumeThread(threadId) {
  return codex.resumeThread(threadId);
}

