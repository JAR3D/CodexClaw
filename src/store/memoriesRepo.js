import { addMemory, searchMemories, getMemoriesByKind } from "../../db.js";

export function createMemoriesRepo() {
  return {
    addMemory,
    searchMemories,
    getMemoriesByKind,
  };
}