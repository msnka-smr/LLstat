// Вкладка "Рекорды": 15 рекордов в четырёх группах, у каждого топ-3.
// Личные рекорды и серии — один игрок на одно место (его лучший результат),
// матчевые — по картам. Равные значения делят место (1, 1, 1 или 1, 2, 2), а
// игроки с таким же результатом, не поместившиеся в топ-3, считаются в `more`
// ("и ещё N с таким же результатом"); исключение — «Железная посещаемость»: там
// показаны все, кто делит 1-е место. Порядок среди равных детерминирован:
// раньше достигший — выше, затем по mapId/steamid64.
//
// maps и sessions должны идти от старой к новой (так их отдаёт build.mjs):
// серии строятся по порядку входа, сам модуль не сортирует.
export const MIN_KILLS_FOR_KD = 15; // иначе 5/0 побеждал бы 30/10
export const MIN_DEATHS_FOR_KD = 10;
export const MIN_STREAK = 2;
export const TOP_N = 3;

const matchUrl = (lobbyId) => `https://cybershoke.net/match/${lobbyId}`;
const kdOf = (p) => (p.d > 0 ? p.k / p.d : p.k);
const round2 = (v) => Math.round(v * 100) / 100;

// a лучше b? rank сравниваем по dir ("desc" — больше лучше), затем раньше, затем по tie.
function better(a, b, dir) {
  if (a.rank !== b.rank) return dir === "desc" ? a.rank > b.rank : a.rank < b.rank;
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt;
  return String(a.tie) < String(b.tie);
}

// Сортирует, проставляет place (1, 1, 1 / 1, 2, 2 / 1, 2, 4) и режет до TOP_N.
// more — сколько не поместившихся делят значение с последним показанным.
function pickTop(candidates, dir, { allLeaders = false } = {}) {
  const sorted = [...candidates].sort((a, b) => (better(a, b, dir) ? -1 : better(b, a, dir) ? 1 : 0));
  let place = 0;
  sorted.forEach((c, i) => {
    if (i === 0 || c.rank !== sorted[i - 1].rank) place = i + 1;
    c.place = place;
  });
  // allLeaders: всех, кто делит 1-е место, показываем даже сверх TOP_N
  const limit = allLeaders ? Math.max(TOP_N, sorted.filter((c) => c.place === 1).length) : TOP_N;
  const top = sorted.slice(0, limit);
  const lastRank = top.length ? top[top.length - 1].rank : null;
  const more = sorted.slice(limit).filter((c) => c.rank === lastRank).length;
  return { top, more };
}
function bestPerPlayer(candidates, dir, options) {
  const best = new Map();
  for (const c of candidates) {
    const cur = best.get(c.steamid64);
    if (!cur || better(c, cur, dir)) best.set(c.steamid64, c);
  }
  return pickTop([...best.values()], dir, options);
}

// Все (карта, игрок) как кандидаты; rank считает вызывающий.
function playerCandidates(maps, filter, rankOf) {
  const out = [];
  for (const m of maps) {
    for (const p of m.players) {
      if (!filter(p)) continue;
      out.push({
        steamid64: p.steamid64, rank: rankOf(p), playedAt: m.playedAt, tie: `${m.mapId}:${p.steamid64}`,
        k: p.k, d: p.d, map: m.map, url: matchUrl(m.lobbyId),
      });
    }
  }
  return out;
}
function personalTop(maps, { filter = () => true, rankOf, dir, value = (c) => c.rank }) {
  const { top, more } = bestPerPlayer(playerCandidates(maps, filter, rankOf), dir);
  return {
    top: top.map((c) => ({
      steamid64: c.steamid64, value: value(c), k: c.k, d: c.d, map: c.map, playedAt: c.playedAt, url: c.url, place: c.place,
    })),
    more,
  };
}

// Самая длинная серия подряд карт игрока, где predicate истинен (>= MIN_STREAK).
function longestRun(items, predicate) {
  let best = null;
  let start = null;
  items.forEach((it, i) => {
    if (predicate(it)) {
      if (start === null) start = i;
      const len = i - start + 1;
      if (len >= MIN_STREAK && (!best || len > best.len)) best = { len, from: items[start].playedAt, to: it.playedAt };
    } else {
      start = null;
    }
  });
  return best;
}
function streakTop(runsByPlayer, options) {
  const candidates = [];
  for (const [steamid64, run] of runsByPlayer) {
    if (run) candidates.push({ steamid64, rank: run.len, playedAt: run.to, tie: steamid64, run });
  }
  const { top, more } = bestPerPlayer(candidates, "desc", options);
  return {
    top: top.map((c) => ({ steamid64: c.steamid64, value: c.run.len, from: c.run.from, to: c.run.to, place: c.place })),
    more,
  };
}

function matchTop(maps, { rankOf, dir }) {
  const candidates = [];
  for (const m of maps) {
    const [a, b] = (m.teams ?? []).map((t) => t.score);
    if (a == null || b == null) continue;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    candidates.push({
      rank: rankOf({ diff: hi - lo, rounds: m.totalRounds ?? hi + lo }),
      playedAt: m.playedAt, tie: m.mapId,
      entry: { map: m.map, score: [hi, lo], rounds: m.totalRounds ?? hi + lo, playedAt: m.playedAt, url: matchUrl(m.lobbyId) },
    });
  }
  const { top, more } = pickTop(candidates, dir);
  return { top: top.map((c) => ({ ...c.entry, place: c.place })), more };
}

// Ничья (равный счёт) — не победа и не поражение: won у всех игроков карты = null.
const isDraw = (m) => m.teams?.length === 2 && m.teams[0].score != null && m.teams[0].score === m.teams[1].score;
const withoutDraws = (m) => (isDraw(m) ? { ...m, players: m.players.map((p) => ({ ...p, won: null })) } : m);

export function computeRecords(allMaps, sessions) {
  const maps = allMaps.map(withoutDraws);

  // карты каждого игрока в хронологическом порядке
  const byPlayer = new Map();
  for (const m of maps) {
    for (const p of m.players) {
      const list = byPlayer.get(p.steamid64) ?? [];
      list.push({ ...p, playedAt: m.playedAt });
      byPlayer.set(p.steamid64, list);
    }
  }
  // skip — карты, которые серию не продолжают и не прерывают (как будто игрок на них не играл)
  const runs = (predicate, skip = () => false) =>
    streakTop(new Map([...byPlayer].map(([id, list]) => [id, longestRun(list.filter((x) => !skip(x)), predicate)])));

  // сессии, в которых играл каждый игрок
  const attended = new Map();
  for (const s of sessions) {
    for (const m of s.maps) for (const p of m.players) {
      const set = attended.get(p.steamid64) ?? new Set();
      set.add(s.id);
      attended.set(p.steamid64, set);
    }
  }
  const attendanceRuns = new Map(
    [...attended].map(([id, set]) => [
      id,
      longestRun(sessions.map((s) => ({ playedAt: s.firstPlayedAt, played: set.has(s.id) })), (x) => x.played),
    ])
  );

  const kdValue = (c) => round2(c.rank);
  const diffOf = (p) => p.k - p.d;
  const record = (id, group, title, hint, result) => ({ id, group, title, hint, top: result.top, more: result.more });
  return [
    record("most-kills", "personal", "Больше всего убийств за карту", "личный максимум за одну карту",
      personalTop(maps, { rankOf: (p) => p.k, dir: "desc" })),
    record("best-kd-diff", "personal", "Лучшая разница K-D за карту", "убийства минус смерти за одну карту",
      personalTop(maps, { rankOf: diffOf, dir: "desc" })),
    record("best-kd", "personal", "Лучший K/D за карту", `минимум ${MIN_KILLS_FOR_KD} убийств на карте`,
      personalTop(maps, { filter: (p) => p.k >= MIN_KILLS_FOR_KD, rankOf: kdOf, dir: "desc", value: kdValue })),
    record("carry-in-loss", "personal", "Тащил в проигрыше", "лучшая разница K-D на проигранной карте",
      personalTop(maps, { filter: (p) => p.won === false && diffOf(p) > 0, rankOf: diffOf, dir: "desc" })),

    record("win-streak", "streaks", "Серия побед подряд", "карт подряд; пропущенные игроком карты серию не рвут",
      runs((x) => x.won === true)),
    record("kd-streak", "streaks", "Серия карт с K/D не ниже 1.0", "карт подряд",
      runs((x) => kdOf(x) >= 1, (x) => x.k === 0 && x.d === 0)), // 0/0 — игрок почти не играл, серию не рвёт
    record("attendance-streak", "streaks", "Железная посещаемость", "сессий подряд",
      streakTop(attendanceRuns, { allLeaders: true })), // решение 2026-10-22: показываем всех лидеров, не режем до топ-3

    record("biggest-win", "matches", "Самый крупный разгром", "наибольшая разница в счёте",
      matchTop(maps, { rankOf: (x) => x.diff, dir: "desc" })),
    record("closest-match", "matches", "Самый упорный матч", "наименьшая разница в счёте",
      matchTop(maps, { rankOf: (x) => x.diff * 1000 - x.rounds, dir: "asc" })),
    record("longest-map", "matches", "Самая долгая карта", "больше всего раундов",
      matchTop(maps, { rankOf: (x) => x.rounds, dir: "desc" })),
    record("shortest-map", "matches", "Самая короткая карта", "меньше всего раундов",
      matchTop(maps, { rankOf: (x) => x.rounds, dir: "asc" })),

    record("worst-kd-diff", "oops", "Трудная карта", "убийства минус смерти за одну карту",
      personalTop(maps, { filter: (p) => diffOf(p) < 0, rankOf: diffOf, dir: "asc" })),
    record("worst-kd", "oops", "Карта не задалась (наименьший K/D)", `считается минимум от ${MIN_DEATHS_FOR_KD} смертей на карте`,
      personalTop(maps, { filter: (p) => p.d >= MIN_DEATHS_FOR_KD, rankOf: kdOf, dir: "asc", value: kdValue })),
    record("most-deaths", "oops", "Горячая точка", "больше всего смертей за одну карту",
      personalTop(maps, { rankOf: (p) => p.d, dir: "desc" })),
    record("loss-streak", "oops", "Полоса неудач", "карт подряд",
      runs((x) => x.won === false)),
  ];
}
