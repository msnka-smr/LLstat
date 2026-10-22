// Подтягивает актуальные аватарки из Steam в data/players.json (steamAvatarUrl).
// build.mjs остаётся без сети и просто берёт это поле. Запускается из update.mjs.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshSteamAvatars, fetchSteamProfileXml } from "./lib/steamAvatar.mjs";

const PLAYERS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "players.json");

async function main() {
  let registry;
  try {
    registry = JSON.parse(await readFile(PLAYERS_PATH, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  const changed = await refreshSteamAvatars(registry, fetchSteamProfileXml);
  if (!changed.length) {
    console.log("Аватарки из Steam: без изменений.");
    return;
  }
  await writeFile(PLAYERS_PATH, JSON.stringify(registry, null, 2) + "\n");
  console.log(`Аватарки из Steam обновлены: ${changed.map((id) => registry[id].lastSeenName ?? id).join(", ")}.`);
}

main().catch((err) => {
  // аватарки не стоят того, чтобы валить обновление статистики
  console.warn(`Аватарки из Steam не обновлены: ${err.message}`);
});
