// Этап 3: build полностью пересобирает docs/data/stats.json из сырых файлов
// data/matches/*.json — никогда не читает предыдущий stats.json и не ходит в сеть.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeLobby } from "./lib/normalize.mjs";
import { assignSessions } from "./lib/session.mjs";
import { aggregatePlayerMaps } from "./lib/aggregate.mjs";
import { computeThreshold } from "./lib/qualify.mjs";
import { sortRows } from "./lib/sort.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATCHES_DIR = path.join(ROOT, "data", "matches");
const CONFIG_PATH = path.join(ROOT, "data", "config.json");
const PLAYERS_PATH = path.join(ROOT, "data", "players.json");
const OUTPUT_PATH = path.join(ROOT, "docs", "data", "stats.json");

const DEFAULT_CONFIG = {
  coreSteamIds: [],
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
      };
      if (!entry.nicknames.includes(p.name)) entry.nicknames.push(p.name);
      entry.lastSeenName = p.name;
      registry[p.steamid64] = entry;
    }
  }
  return registry;
}

function displayName(registry, steamid64) {
  const entry = registry[steamid64];
  return entry?.displayName ?? entry?.lastSeenName ?? steamid64;
}

function buildRow(steamid64, registry, mapsForPlayer, threshold, leagueAvgRating) {
  const agg = aggregatePlayerMaps(mapsForPlayer);
  const ratingRel = agg.rating != null && leagueAvgRating ? agg.rating / leagueAvgRating : null;
  return {
    steamid64,
    name: displayName(registry, steamid64),
    mapsPlayed: agg.mapsPlayed,
    wins: agg.wins,
    losses: agg.losses,
    winRate: agg.mapsPlayed ? agg.wins / agg.mapsPlayed : null,
    k: agg.k,
    d: agg.d,
    a: agg.a,
    kd: agg.kd,
    adr: agg.adr,
    kast: agg.kast,
    kpr: agg.kpr,
    dpr: agg.dpr,
    hsPercent: agg.hsPercent,
    fk: agg.fk,
    fd: agg.fd,
    mvp: agg.mvp,
    mk3plus: agg.mk3plus,
    clutchesWon: agg.clutchesWon,
    clutchSituations: agg.clutchSituations,
    rating: agg.rating,
    ratingRel,
    fullTierMapsPlayed: agg.fullTierMaps,
    fullTierRounds: agg.fullTierRounds,
    isQualified: agg.mapsPlayed >= threshold,
  };
}

async function main() {
  const config = { ...DEFAULT_CONFIG, ...(await readJson(CONFIG_PATH, {})) };
  const registry = await readJson(PLAYERS_PATH, {});

  const allMaps = await loadAllMaps();

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
      list.push({ ...p, statsTier: map.statsTier });
      byPlayerAllTime.set(p.steamid64, list);
    }
  }

  const threshold = computeThreshold(
    [...byPlayerAllTime.values()].map((maps) => maps.length),
    { qualifyShare: config.qualifyShare, qualifyMinMaps: config.qualifyMinMaps }
  );
  const maxMaps = Math.max(0, ...[...byPlayerAllTime.values()].map((maps) => maps.length));

  // средний рейтинг лиги, взвешенный по full-tier раундам — используется только для ratingRel
  let ratingRoundsSum = 0;
  let roundsSum = 0;
  for (const [steamid64, mapsForPlayer] of byPlayerAllTime) {
    const agg = aggregatePlayerMaps(mapsForPlayer);
    if (agg.rating != null) {
      ratingRoundsSum += agg.rating * agg.fullTierRounds;
      roundsSum += agg.fullTierRounds;
    }
  }
  const leagueAvgRating = roundsSum ? ratingRoundsSum / roundsSum : null;

  const allTimeRows = [...byPlayerAllTime.entries()].map(([steamid64, mapsForPlayer]) =>
    buildRow(steamid64, registry, mapsForPlayer, threshold, leagueAvgRating)
  );
  const allTimeRowsSorted = sortRows(allTimeRows, "rating", "desc");

  const lastSession = sessions[sessions.length - 1] ?? null;
  let lastSessionOutput = null;
  if (lastSession) {
    const byPlayerSession = new Map();
    for (const map of lastSession.maps) {
      for (const p of map.players) {
        const list = byPlayerSession.get(p.steamid64) ?? [];
        list.push({ ...p, statsTier: map.statsTier });
        byPlayerSession.set(p.steamid64, list);
      }
    }
    const sessionRows = [...byPlayerSession.entries()].map(([steamid64, mapsForPlayer]) => {
      const row = buildRow(steamid64, registry, mapsForPlayer, threshold, leagueAvgRating);
      const allTimeRow = allTimeRows.find((r) => r.steamid64 === steamid64);
      row.ratingDelta =
        row.rating != null && allTimeRow?.rating != null ? row.rating - allTimeRow.rating : null;
      return row;
    });

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
    },
    colorMode: config.colorMode,
    colorThresholds: config.colorThresholds,
    leagueAvgRating,
    allTime: { players: allTimeRowsSorted },
    lastSession: lastSessionOutput,
  };

  await writeJson(OUTPUT_PATH, output);

  const ratedRows = allTimeRows.filter((r) => r.ratingRel != null && r.fullTierRounds > 0);
  const weightedRatingRel = ratedRows.length
    ? ratedRows.reduce((s, r) => s + r.ratingRel * r.fullTierRounds, 0) /
      ratedRows.reduce((s, r) => s + r.fullTierRounds, 0)
    : null;

  console.log(`Карт учтено: ${sortedMaps.length}, сессий: ${sessions.length}, порог: ${threshold} карт (максимум ${maxMaps}).`);
  console.log(
    `Средний ratingRel по лиге, взвешенный по раундам (должен быть 1.00 ± 0.01): ${
      weightedRatingRel != null ? weightedRatingRel.toFixed(4) : "н/д (нет полных карт)"
    }`
  );
  console.log(`Записано в ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exit(1);
});
