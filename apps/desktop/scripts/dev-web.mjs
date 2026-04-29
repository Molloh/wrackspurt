// @ts-check
/**
 * Wrapper around `next dev` for Tauri's beforeDevCommand. Frees port 1420
 * if a stale process from a previous session is still listening, then
 * spawns the Next dev server on that port.
 */
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 1420;
const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..", "..", "..");

function freePort(port) {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return;
    const pids = out.split(/\s+/).filter(Boolean);
    if (pids.length === 0) return;
    console.log(`[dev-web] freeing port ${port} (killing ${pids.join(", ")})`);
    execSync(`kill -9 ${pids.join(" ")}`, { stdio: "ignore" });
  } catch {
    // lsof exits 1 when nothing matches — that's fine.
  }
}

freePort(PORT);

const child = spawn(
  "pnpm",
  ["--filter", "@wrackspurt/web", "exec", "next", "dev", "--port", String(PORT)],
  { cwd: repoRoot, stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
