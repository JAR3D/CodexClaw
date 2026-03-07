import fs from "node:fs";
import path from "node:path";

const LOCK_DIR = path.resolve("./store");
const LOCK_FILE = path.join(LOCK_DIR, "codexclaw.lock");

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function readLockPid() {
  try {
    const raw = fs.readFileSync(LOCK_FILE, "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

export function acquireProcessLock() {
  fs.mkdirSync(LOCK_DIR, { recursive: true });

  while (true) {
    try {
      const fd = fs.openSync(LOCK_FILE, "wx");
      fs.writeFileSync(fd, String(process.pid), "utf8");
      fs.closeSync(fd);
      break;
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;

      const existingPid = readLockPid();
      if (existingPid && isPidRunning(existingPid)) {
        console.error(
          `❌ Outra instância já está a correr (pid=${existingPid}, lock: ${LOCK_FILE})`
        );
        process.exit(1);
      }

      try {
        fs.unlinkSync(LOCK_FILE);
      } catch (unlinkErr) {
        if (unlinkErr?.code !== "ENOENT") {
          console.error(`❌ Lock inválido, mas não consegui remover: ${LOCK_FILE}`);
          process.exit(1);
        }
      }
    }
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
