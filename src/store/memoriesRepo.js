import { addMemory, searchMemories, getMemoriesByKind, touchMemories } from "../../db.js";

export function createMemoriesRepo() {
  return {
    addMemory,
    searchMemories,
    getMemoriesByKind,
    touchMemories,
  };
}