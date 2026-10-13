// Секция "sessions" для stats.json: все игровые вечера, от новых к старым.
// Для каждой сессии рейтинг игрока — статический (calcSessionRating по картам
// только этой сессии), та же логика, что раньше считалась только для последней.
import { calcSessionRating } from "./sessionRating.mjs";
import { sortRows } from "./sort.mjs";

// makeRow(steamid64, mapsForPlayer, sessionRating) → строка игрока для таблицы.
export function buildSessionOutput(session, makeRow) {
  const byPlayer = new Map();
  for (const map of session.maps) {
    for (const p of map.players) {
      const list = byPlayer.get(p.steamid64) ?? [];
      list.push({ ...p, mapTotalRounds: map.totalRounds });
      byPlayer.set(p.steamid64, list);
    }
  }
  const rows = [...byPlayer.entries()].map(([steamid64, mapsForPlayer]) =>
    makeRow(steamid64, mapsForPlayer, calcSessionRating(mapsForPlayer))
  );

  return {
    id: session.id,
    firstPlayedAt: session.firstPlayedAt,
    lastPlayedAt: session.lastPlayedAt,
    maps: session.maps.map((m) => ({
      mapId: m.mapId,
      lobbyId: m.lobbyId,
      map: m.map,
      statsTier: m.statsTier,
      teams: m.teams,
      url: `https://cybershoke.net/match/${m.lobbyId}`,
    })),
    players: sortRows(rows, "rating", "desc"),
  };
}

// sessions — от старой к новой (как отдаёт assignSessions); на выходе — наоборот.
export function buildSessionsOutput(sessions, makeRow) {
  return [...sessions].reverse().map((s) => buildSessionOutput(s, makeRow));
}
