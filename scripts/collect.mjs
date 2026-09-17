// Этап 2: сборщик матчей cybershoke.
//
// Режим 1 (по умолчанию): свои матчи через lobbys/list + кука из .env.
//   node scripts/collect.mjs
//
// Режим 2 (ручная дозагрузка): без авторизации, по id/ссылкам.
//   node scripts/collect.mjs --add <ссылки или id> [--file links.txt] [--force]
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATCHES_DIR = path.join(ROOT, "data", "matches");
const INDEX_PATH = path.join(ROOT, "data", "index.json");
const PENDING_PATH = path.join(ROOT, "data", "pending.json");
const CONFIG_PATH = path.join(ROOT, "data", "config.json");
const ENV_PATH = path.join(ROOT, ".env");

const API_BASE = "https://cybershoke.net/api/api/v1/";
const REQUEST_DELAY_MS = 2500;
const MAX_RETRIES = 5;
// Если демка не разобралась за это время, считаем статы утраченными навсегда
// (basic tier), а не ждём вечно в pending.json.
const DEMO_STALE_DAYS = 75;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n");
}

async function loadCookie() {
  const text = await readFile(ENV_PATH, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== "CYBERSHOKE_COOKIE") continue;
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    return value || null;
  }
  return null;
}

let lastRequestAt = 0;
async function apiPost(pathName, body, cookie) {
  let delay = REQUEST_DELAY_MS;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const wait = REQUEST_DELAY_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(API_BASE + pathName, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 || res.status === 503) {
      console.log(`  [${res.status}] пауза ${delay}мс, попытка ${attempt}/${MAX_RETRIES}`);
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
      continue;
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `Ответ ${pathName} — не JSON (статус ${res.status}). Похоже на страницу Cloudflare, а не на API. Первые 300 символов:\n${text.slice(0, 300)}`
      );
    }
    return json;
  }
  throw new Error(`${pathName}: превышено число попыток из-за 429/503`);
}

function extractLobbyId(token) {
  const found = token.match(/\d{7,}/g);
  if (!found) return null;
  return Number(found[found.length - 1]);
}

function stripHeavy(raw) {
  if (raw?.data?.match_more_stats?.replay) delete raw.data.match_more_stats.replay;
  const maps = raw?.data?.match_more_stats?.maps;
  if (maps) {
    for (const key of Object.keys(maps)) {
      if (maps[key]?.replay) delete maps[key].replay;
    }
  }
  return raw;
}

function classifyStats(raw) {
  const stats = raw?.data?.match_more_stats?.stats;
  if (stats && stats.status === "finished") return "full";
  const matchEndedAt = raw?.data?.dates?.unixtime_match_end;
  if (matchEndedAt) {
    const ageDays = (Date.now() / 1000 - matchEndedAt) / 86400;
    if (ageDays > DEMO_STALE_DAYS) return "basic";
  }
  return "pending";
}

function isFiveVFive(raw) {
  const slots = raw?.data?.count_players_slots ?? {};
  return slots["2"] === 5 && slots["3"] === 5;
}

function countCorePlayers(raw, coreSteamIds) {
  if (!coreSteamIds.length) return null; // список ещё не настроен — проверку пропускаем
  const core = new Set(coreSteamIds.map(String));
  const players = Object.keys(raw?.data?.players ?? {});
  return players.filter((id) => core.has(id)).length;
}

async function fetchLobbyInfo(idLobby) {
  return apiPost("custom-matches/lobbys/info", {
    id_lobby: idLobby,
    lobby_password: "",
    players_waiting_all: false,
  });
}

async function fetchOwnLobbyIds(cookie) {
  const json = await apiPost(
    "custom-matches/lobbys/list",
    {
      lobby_status: 3,
      only_my_matches: true,
      type_lobby: [],
      name_map: [],
      id_data_center: [],
      only_friends: false,
    },
    cookie
  );
  if (json?.result === "error") {
    throw new Error(
      "cybershoke ответил ошибкой на lobbys/list — скорее всего, кука в .env протухла.\n" +
        "Как обновить куку — раздел «Как достать куки» в SPEC.md.\n" +
        "Либо используй ручную дозагрузку: npm run add -- <ссылки или id>."
    );
  }
  const list = Array.isArray(json?.data)
    ? json.data
    : json?.data?.lobbys ?? json?.data?.list ?? null;
  if (!Array.isArray(list)) {
    throw new Error(
      "Не нашёл список лобби в ответе lobbys/list — формат ответа не совпадает с ожидаемым.\n" +
        "Нужно остановиться и свериться с реальным ответом. Сырой ответ (обрезан):\n" +
        JSON.stringify(json).slice(0, 500)
    );
  }
  return list.map((item) => item.id_lobby).filter(Boolean);
}

async function alreadyCollected() {
  await mkdir(MATCHES_DIR, { recursive: true });
  const files = await readdir(MATCHES_DIR);
  return new Set(
    files.filter((f) => f.endsWith(".json")).map((f) => Number(f.slice(0, -5)))
  );
}

async function saveMatch(idLobby, raw, index, statsTier) {
  stripHeavy(raw);
  await writeJson(path.join(MATCHES_DIR, `${idLobby}.json`), raw);
  const map =
    raw?.data?.match_settings?.map_name ??
    raw?.data?.match_more_stats?.stats?.map ??
    null;
  const playedAt =
    raw?.data?.dates?.unixtime_match_end ??
    raw?.data?.dates?.unixtime_start_match ??
    null;
  const entry = { idLobby, map, playedAt, statsTier, status: "finished" };
  const existingIdx = index.findIndex((e) => e.idLobby === idLobby);
  if (existingIdx >= 0) index[existingIdx] = entry;
  else index.push(entry);
}

async function processLobby(idLobby, { index, pending, coreSteamIds, force }) {
  const raw = await fetchLobbyInfo(idLobby);
  if (!raw?.data) {
    console.log(`  ${idLobby}: лобби не найдено или недоступно — пропускаю`);
    return { skipped: true, reason: "not-found" };
  }
  if (raw.data.status_match !== 5) {
    console.log(
      `  ${idLobby}: матч ещё не завершён или отменён (status_match=${raw.data.status_match}) — пропускаю`
    );
    return { skipped: true, reason: "unfinished" };
  }

  if (!isFiveVFive(raw)) {
    if (!force) {
      console.log(
        `  ${idLobby}: формат матча не 5x5 — отказ (передай --force, чтобы добавить всё равно)`
      );
      return { skipped: true, reason: "not-5v5" };
    }
    console.log(`  ${idLobby}: формат не 5x5, но добавляю по --force`);
  }

  const coreCount = countCorePlayers(raw, coreSteamIds);
  if (coreCount !== null && coreCount < 3) {
    if (!force) {
      const names = Object.values(raw.data.players ?? {})
        .map((p) => p.name)
        .join(", ");
      console.log(
        `  ${idLobby}: из вашей компании только ${coreCount} игрок(а). Игроки в матче: ${names}`
      );
      console.log(`  Похоже на чужой матч. Передай --force, чтобы добавить всё равно.`);
      return { skipped: true, reason: "not-core" };
    }
    console.log(`  ${idLobby}: мало игроков из coreSteamIds, но добавляю по --force`);
  }

  const statsTier = classifyStats(raw);
  if (statsTier === "pending") {
    if (!pending.find((p) => p.idLobby === idLobby)) {
      pending.push({ idLobby, firstSeenAt: Date.now() });
    }
    console.log(`  ${idLobby}: разбор демки ещё не готов — отложено в pending.json`);
    return { pending: true };
  }

  await saveMatch(idLobby, raw, index, statsTier);
  const removeIdx = pending.findIndex((p) => p.idLobby === idLobby);
  if (removeIdx >= 0) pending.splice(removeIdx, 1);
  console.log(`  ${idLobby}: сохранено (${statsTier})`);
  return { saved: true, statsTier };
}

function parseArgs(argv) {
  const isAdd = argv[0] === "--add";
  const rest = isAdd ? argv.slice(1) : argv;
  const force = rest.includes("--force");
  let tokens = rest.filter((a) => a !== "--force");
  const fileIdx = tokens.indexOf("--file");
  let filePath = null;
  if (fileIdx >= 0) {
    filePath = tokens[fileIdx + 1];
    tokens = tokens.filter((_, i) => i !== fileIdx && i !== fileIdx + 1);
  }
  return { isAdd, force, filePath, tokens };
}

async function resolveManualIds(tokens, filePath) {
  let raw = tokens.join(",");
  if (filePath) {
    raw += "," + (await readFile(path.resolve(filePath), "utf8"));
  }
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const ids = [];
  const seen = new Set();
  const unrecognized = [];
  for (const part of parts) {
    const id = extractLobbyId(part);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    } else if (!id) {
      unrecognized.push(part);
    }
  }
  return { ids, unrecognized };
}

async function main() {
  const { isAdd, force, filePath, tokens } = parseArgs(process.argv.slice(2));

  const config = await readJson(CONFIG_PATH, { coreSteamIds: [] });
  const index = await readJson(INDEX_PATH, []);
  const pending = await readJson(PENDING_PATH, []);
  const have = await alreadyCollected();

  let idsToFetch;
  let unrecognized = [];

  if (isAdd) {
    const resolved = await resolveManualIds(tokens, filePath);
    idsToFetch = resolved.ids;
    unrecognized = resolved.unrecognized;
  } else {
    const cookie = await loadCookie();
    if (!cookie) {
      console.error(
        "Не найдена CYBERSHOKE_COOKIE в .env — без неё режим «свои матчи» не работает.\n" +
          "Как получить куку — раздел «Как достать куки» в SPEC.md.\n" +
          "Либо используй ручную дозагрузку: npm run add -- <ссылки или id>."
      );
      process.exit(1);
    }
    console.log("Запрашиваю список своих матчей...");
    idsToFetch = await fetchOwnLobbyIds(cookie);
    console.log(`Найдено лобби: ${idsToFetch.length}`);
  }

  // добираем то, что в прошлый раз зависло в ожидании разбора демки
  for (const p of pending) {
    if (!idsToFetch.includes(p.idLobby)) idsToFetch.push(p.idLobby);
  }

  const newIds = idsToFetch.filter((id) => !have.has(id));
  const alreadyHave = idsToFetch.length - newIds.length;
  console.log(`К обработке: ${newIds.length} новых, ${alreadyHave} уже собраны.`);

  let saved = 0;
  let skipped = 0;
  let stillPending = 0;

  for (let i = 0; i < newIds.length; i++) {
    const idLobby = newIds[i];
    console.log(`[${i + 1}/${newIds.length}] ${idLobby}`);
    try {
      const result = await processLobby(idLobby, {
        index,
        pending,
        coreSteamIds: config.coreSteamIds,
        force,
      });
      if (result.saved) saved++;
      else if (result.pending) stillPending++;
      else skipped++;
    } catch (err) {
      console.error(`  ${idLobby}: ошибка — ${err.message}`);
    } finally {
      // сохраняем прогресс сразу после каждого матча, а не в конце
      await writeJson(INDEX_PATH, index);
      await writeJson(PENDING_PATH, pending);
    }
  }

  if (unrecognized.length) {
    console.log(`Не распознано как id/ссылка: ${unrecognized.join(", ")}`);
  }

  console.log(
    `\nИтого: сохранено ${saved}, отложено в pending ${stillPending}, пропущено ${skipped}, уже было ${alreadyHave}.`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
