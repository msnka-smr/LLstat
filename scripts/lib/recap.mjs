// "Итоги вечера": данные для карточки выбранной сессии. MVP и топ-3 — по
// рейтингу сессии среди ВСЕХ игроков вечера (квалификация "за всё время" не
// важна: гость или новичок с лучшим вечером тоже может стать MVP). Рост и
// просадка — изменение рейтинга "за всё время" за этот вечер, из ratingHistory.
export const TOP_N = 3;
export const START_RATING = 500; // с него начинается рейтинг "за всё время"

const round2 = (v) => Math.round(v * 100) / 100;
const byId = (a, b) => String(a.steamid64).localeCompare(String(b.steamid64));

// Рейтинг ↓, затем разница K-D ↓, затем steamid64 — детерминированный порядок.
function byRatingDesc(a, b) {
  return (
    (b.rating ?? -Infinity) - (a.rating ?? -Infinity) ||
    (b.kdDiff ?? -Infinity) - (a.kdDiff ?? -Infinity) ||
    byId(a, b)
  );
}

// session — элемент sessions[] из stats.json (players — строки buildRow);
// ratingHistory — результат computeRatingHistory или undefined.
export function computeRecap(session, ratingHistory) {
  const players = session.players ?? [];
  const top = [...players]
    .sort(byRatingDesc)
    .slice(0, TOP_N)
    .map((p) => ({
      steamid64: p.steamid64,
      rating: p.rating,
      kd: p.kd == null ? null : round2(p.kd),
      kdDiff: p.kdDiff,
      wins: p.wins,
      maps: p.mapsPlayed,
    }));

  const idx = ratingHistory ? ratingHistory.sessions.findIndex((s) => s.id === session.id) : -1;
  const deltas = [];
  if (idx !== -1) {
    for (const p of players) {
      const arr = ratingHistory.players[p.steamid64];
      if (!arr || arr[idx] == null) continue;
      // до этого вечера: значение после предыдущей сессии, а для первого вечера игрока — старт
      const before = idx > 0 && arr[idx - 1] != null ? arr[idx - 1] : START_RATING;
      deltas.push({ steamid64: p.steamid64, delta: arr[idx] - before });
    }
  }
  const rise = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta || byId(a, b))[0] ?? null;
  const drop = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta || byId(a, b))[0] ?? null;

  return { top, rise, drop };
}
