import { addMemory, searchMemories } from "../../db.js";

export function createMemoriesRepo() {
  return {
    addMemory,
    searchMemories,
  };
}