import { getSession, saveSession } from "../../db.js";

export function createSessionsRepo() {
  return {
    getThreadId(channelId) {
      return getSession(channelId);
    },
    setThreadId(channelId, threadId) {
      saveSession(channelId, threadId);
    },
  };
}