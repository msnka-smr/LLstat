// Полный цикл обновления: collect → build → commit → push.
// npm run update            — свои матчи (нужна CYBERSHOKE_COOKIE в .env)
// npm run add -- <id/ссылки> — ручная дозагрузка, дальше то же самое
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
}

function main() {
  const args = process.argv.slice(2);

  run("node", ["scripts/collect.mjs", ...args]);
  run("node", ["scripts/build.mjs"]);

  const status = runCapture("git", ["status", "--porcelain"]);
  if (!status.trim()) {
    console.log("\nНет изменений — коммитить нечего.");
    return;
  }

  run("git", ["add", "-A"]);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  run("git", ["commit", "-m", `Update stats (${stamp})`]);
  run("git", ["push"]);
}

main();
