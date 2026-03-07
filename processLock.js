import fs from "node:fs";
import path from "node:path";

const LOCK_DIR = path.resolve("./store");
const LOCK_FILE = path.join(LOCK_DIR, "codexclaw.lock");

export function acquireProcessLock() {
  fs.mkdirSync(LOCK_DIR, { recursive: true });

  try {
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeFileSync(fd, String(process.pid), "utf8");
    fs.closeSync(fd);
  } catch (err) {
    if (err && err.code === "EEXIST") {
      console.error(`❌ Outra instância já está a correr (lock: ${LOCK_FILE})`);
      process.exit(1);
    }
    throw err;
  }

  const release = () => {
    try {
      if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    } catch {}
  };

  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    release();
    process.exit(0);
  });
}
