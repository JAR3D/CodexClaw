import { startNewThread, resumeThread } from "../../codexClient.js";

export function getCodexEngine() {
  return {
    getThread(threadId) {
      if (threadId) return resumeThread(threadId);
      return startNewThread();
    },
  };
}