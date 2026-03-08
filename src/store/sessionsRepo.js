import { getSession, saveSession } from "../../db.js";

export function createSessionsRepo() {
  return {
    getThreadId(channelId) {
      return getSession(channelId);
    },
    setThreadId(channelId, threadId) {
      const value = String(threadId || "").trim();
      if (!value) {
        throw new Error("setThreadId: threadId is required");
      }

      saveSession(channelId, value);
    },
  };
}