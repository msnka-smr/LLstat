// Этап 3: build полностью пересобирает docs/data/stats.json из сырых файлов
// data/matches/*.json — никогда не читает предыдущий stats.json и не ходит в сеть.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeLobby } from "./lib/normalize.mjs";
import { applyAliases } from "./lib/aliases.mjs";
import { assignSessions } from "./lib/session.mjs";
import { aggregatePlayerMaps } from "./lib/aggregate.mjs";
import { computeThreshold } from "./lib/qualify.mjs";
import { sortRows } from "./lib/sort.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATCHES_DIR = path.join(ROOT, "data", "matches");
const CONFIG_PATH = path.join(ROOT, "data", "config.json");
const PLAYERS_PATH = path.join(ROOT, "data", "players.json");
const THRESHOLD_STATE_PATH = path.join(ROOT, "data", "threshold-state.json");
const OUTPUT_PATH = path.join(ROOT, "docs", "data", "stats.json");

const DEFAULT_CONFIG = {
  coreSteamIds: [],
  steamAliases: {},
  sessionGapHours: 6,
  sessionTimezone: "Europe/Samara",
  qualifyShare: 0.3,
  qualifyMinMaps: 5,
  colorMode: "threshold",
  colorThresholds: { strong: 1.08, weak: 0.92 },
};

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

async function loadAllMaps() {
  await mkdir(MATCHES_DIR, { recursive: true });
  const files = await readdir(MATCHES_DIR);
  const maps = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readJson(path.join(MATCHES_DIR, file), null);
    if (!raw) continue;
    maps.push(...normalizeLobby(raw));
  }
  return maps;
}

function countCorePlayers(map, coreSteamIds) {
  if (!coreSteamIds.length) return null;
  const core = new Set(coreSteamIds.map(String));
  return map.players.filter((p) => core.has(p.steamid64)).length;
}

function updatePlayersRegistry(registry, maps) {
  // сортируем по времени, чтобы "последний ник" был действительно последним
  const byTime = [...maps].sort((a, b) => (a.playedAt ?? 0) - (b.playedAt ?? 0));
  for (const map of byTime) {
    for (const p of map.players) {
      const entry = registry[p.steamid64] ?? {
        displayName: null,
        nicknames: [],
        lastSeenName: null,
        avatarUrl: null,
      };
      if (!entry.nicknames.includes(p.name)) entry.nicknames.push(p.name);
      entry.lastSeenName = p.name;
      if (p.avatar) entry.avatarUrl = p.avatar;
      registry[p.steamid64] = entry;
    }
  }
  return registry;
}

function displayName(registry, steamid64) {
  const entry = registry[steamid64];
  return entry?.displayName ?? entry?.lastSeenName ?? steamid64;
}

function buildRow(steamid64, registry, mapsForPlayer, threshold) {
  const agg = aggregatePlayerMaps(mapsForPlayer);
  const totalRounds = mapsForPlayer.reduce((sum, m) => sum + (m.mapTotalRounds ?? 0), 0);
  return {
    steamid64,
    name: displayName(registry, steamid64),
    avatarUrl: registry[steamid64]?.avatarUrl ?? null,
    steamProfileUrl: `https://steamcommunity.com/profiles/${steamid64}`,
    totalRounds,
    mapsPlayed: agg.mapsPlayed,
    wins: agg.wins,
    losses: agg.losses,
    winRate: agg.mapsPlayed ? agg.wins / agg.mapsPlayed : null,
    k: agg.k,
    d: agg.d,
    kd: agg.kd,
    // Формула рейтинга ещё не пересобрана под lobby-данные — колонка
    // остаётся в схеме, но пока всегда пустая.
    rating: null,
    ratingRel: null,
    isQualified: agg.mapsPlayed >= threshold,
  };
}

async function main() {
  const config = { ...DEFAULT_CONFIG, ...(await readJson(CONFIG_PATH, {})) };
  const registry = await readJson(PLAYERS_PATH, {});

  const allMaps = applyAliases(await loadAllMaps(), config.steamAliases);

  const includedMaps = allMaps.filter((m) => {
    const coreCount = countCorePlayers(m, config.coreSteamIds);
    return coreCount === null || coreCount >= 3;
  });

  updatePlayersRegistry(registry, includedMaps);
  await writeJson(PLAYERS_PATH, registry);

  const { maps: sortedMaps, sessions } = assignSessions(includedMaps, {
    gapHours: config.sessionGapHours,
    timezone: config.sessionTimezone,
  });

  const byPlayerAllTime = new Map();
  for (const map of sortedMaps) {
    for (const p of map.players) {
      const list = byPlayerAllTime.get(p.steamid64) ?? [];
      list.push({ ...p, mapTotalRounds: map.totalRounds });
      byPlayerAllTime.set(p.steamid64, list);
    }
  }

  const threshold = computeThreshold(
    [...byPlayerAllTime.values()].map((maps) => maps.length),
    { qualifyShare: config.qualifyShare, qualifyMinMaps: config.qualifyMinMaps }
  );
  const maxMaps = Math.max(0, ...[...byPlayerAllTime.values()].map((maps) => maps.length));

  const allTimeRows = [...byPlayerAllTime.entries()].map(([steamid64, mapsForPlayer]) =>
    buildRow(steamid64, registry, mapsForPlayer, threshold)
  );
  const allTimeRowsSorted = sortRows(allTimeRows, "rating", "desc");

  // Порог плавает и нигде не запоминается (пересчитывается каждый build), но если
  // он вырос настолько, что кто-то выпал из квалификации — молча посереть для
  // человека выглядит как баг. Единственное, что переживает между запусками —
  // сам факт "кто был квалифицирован при каком пороге", специально для этого баннера.
  const prevThresholdState = await readJson(THRESHOLD_STATE_PATH, null);
  const qualifiedNowIds = allTimeRowsSorted.filter((r) => r.isQualified).map((r) => r.steamid64);
  let qualificationDrop = null;
  if (prevThresholdState && threshold > prevThresholdState.threshold) {
    const droppedIds = prevThresholdState.qualifiedSteamIds.filter(
      (id) => !qualifiedNowIds.includes(id)
    );
    if (droppedIds.length) {
      qualificationDrop = {
        previousThreshold: prevThresholdState.threshold,
        threshold,
        droppedNames: droppedIds.map((id) => displayName(registry, id)),
      };
    }
  }
  await writeJson(THRESHOLD_STATE_PATH, { threshold, qualifiedSteamIds: qualifiedNowIds });

  const lastSession = sessions[sessions.length - 1] ?? null;
  let lastSessionOutput = null;
  if (lastSession) {
    const byPlayerSession = new Map();
    for (const map of lastSession.maps) {
      for (const p of map.players) {
        const list = byPlayerSession.get(p.steamid64) ?? [];
        list.push({ ...p, mapTotalRounds: map.totalRounds });
        byPlayerSession.set(p.steamid64, list);
      }
    }
    const sessionRows = [...byPlayerSession.entries()].map(([steamid64, mapsForPlayer]) =>
      buildRow(steamid64, registry, mapsForPlayer, threshold)
    );

    lastSessionOutput = {
      id: lastSession.id,
      firstPlayedAt: lastSession.firstPlayedAt,
      lastPlayedAt: lastSession.lastPlayedAt,
      maps: lastSession.maps.map((m) => ({
        mapId: m.mapId,
        lobbyId: m.lobbyId,
        map: m.map,
        statsTier: m.statsTier,
        teams: m.teams,
        url: `https://cybershoke.net/match/${m.lobbyId}`,
      })),
      players: sortRows(sessionRows, "rating", "desc"),
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    totalMapsCollected: sortedMaps.length,
    qualification: {
      threshold,
      maxMaps,
      qualifyShare: config.qualifyShare,
      qualifyMinMaps: config.qualifyMinMaps,
      qualificationDrop,
    },
    colorMode: config.colorMode,
    colorThresholds: config.colorThresholds,
    allTime: { players: allTimeRowsSorted },
    lastSession: lastSessionOutput,
  };

  await writeJson(OUTPUT_PATH, output);

  console.log(`Карт учтено: ${sortedMaps.length}, сессий: ${sessions.length}, порог: ${threshold} карт (максимум ${maxMaps}).`);
  console.log(`Записано в ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exit(1);
});
