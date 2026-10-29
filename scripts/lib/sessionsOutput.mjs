// Секция "sessions" для stats.json: все игровые вечера, от новых к старым.
// Для каждой сессии рейтинг игрока — статический (calcSessionRating по картам
// только этой сессии), та же логика, что раньше считалась только для последней.
import { calcSessionRating } from "./sessionRating.mjs";
import { sortRows } from "./sort.mjs";

// makeRow(steamid64, mapsForPlayer, sessionRating) → строка игрока для таблицы.
// nameOf(steamid64, fallbackName) → отображаемое имя игрока (по умолчанию ник из матча).
export function buildSessionOutput(session, makeRow, nameOf = (_id, fallback) => fallback) {
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
      duels: m.duels ?? null, // матрица дуэлей: только для списка «Карты вечера»
      url: `https://cybershoke.net/match/${m.lobbyId}`,
      // Для списка «Карты вечера»: состав и K/D/A по этой карте. Ассисты живут
      // только здесь — в строки игроков и рейтинги они не попадают.
      players: m.players.map((p) => ({
        steamid64: p.steamid64,
        name: nameOf(p.steamid64, p.name ?? p.steamid64),
        team: p.team ?? null,
        k: p.k,
        d: p.d,
        a: p.a ?? 0,
      })),
    })),
    players: sortRows(rows, "rating", "desc"),
  };
}

// sessions — от старой к новой (как отдаёт assignSessions); на выходе — наоборот.
export function buildSessionsOutput(sessions, makeRow, nameOf) {
  return [...sessions].reverse().map((s) => buildSessionOutput(s, makeRow, nameOf));
}
