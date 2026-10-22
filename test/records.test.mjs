import test from "node:test";
import assert from "node:assert/strict";
import {
  computeRecords,
  MIN_KILLS_FOR_KD,
  MIN_DEATHS_FOR_KD,
} from "../scripts/lib/records.mjs";

const DAY = 86400;
let seq = 0;
// score = [счёт команды победителя, счёт проигравшей]; players — игроки одной карты
function mapOf({ day, score = [13, 7], rounds, players, map = "de_dust2", lobbyId = 1000 + ++seq }) {
  return {
    mapId: `${lobbyId}-0`,
    lobbyId,
    map,
    playedAt: day * DAY,
    totalRounds: rounds ?? score[0] + score[1],
    teams: [{ score: score[0] }, { score: score[1] }],
    players,
  };
}
const p = (steamid64, k, d, won) => ({ steamid64, k, d, won });
function sessionsOf(...groups) {
  // groups: массивы карт одной сессии; id = ГГГГ-ММ-ДД условно по номеру
  return groups.map((maps, i) => ({ id: "S" + (i + 1), firstPlayedAt: maps[0].playedAt, maps }));
}
const rec = (all, id) => all.find((r) => r.id === id);

test("returns 15 records in group order with titles and hints", () => {
  const all = computeRecords([], []);
  assert.equal(all.length, 15);
  assert.deepEqual(
    [...new Set(all.map((r) => r.group))],
    ["personal", "streaks", "matches", "oops"]
  );
  assert.ok(all.every((r) => r.title && r.hint && Array.isArray(r.top)));
  assert.equal(rec(all, "worst-kd-diff").title, "Трудная карта");
  assert.equal(rec(all, "loss-streak").title, "Полоса неудач");
});

test("empty input gives empty tops", () => {
  const all = computeRecords([], []);
  assert.ok(all.every((r) => r.top.length === 0));
});

test("a player holds one place per record with their best result", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 30, 10, true), p("B", 20, 10, false)] }),
    mapOf({ day: 2, players: [p("A", 28, 12, true), p("B", 10, 10, false)] }),
    mapOf({ day: 3, players: [p("C", 25, 20, false)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "most-kills").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["A", "C", "B"]);
  assert.deepEqual(top.map((e) => e.value), [30, 25, 20]);
});

test("top is capped at three entries", () => {
  const maps = [mapOf({ day: 1, players: ["A", "B", "C", "D", "E"].map((id, i) => p(id, 10 + i, 10, true)) })];
  assert.equal(rec(computeRecords(maps, sessionsOf(maps)), "most-kills").top.length, 3);
});

test("equal values: the earlier result ranks higher", () => {
  const maps = [
    mapOf({ day: 5, players: [p("LATE", 20, 10, true)] }),
    mapOf({ day: 2, players: [p("EARLY", 20, 10, true)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "most-kills").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["EARLY", "LATE"]);
});

test("personal entry carries map, date, kills/deaths and match url", () => {
  const maps = [mapOf({ day: 3, lobbyId: 777, map: "de_mirage", players: [p("A", 25, 10, true)] })];
  const [e] = rec(computeRecords(maps, sessionsOf(maps)), "most-kills").top;
  assert.deepEqual(e, {
    steamid64: "A", value: 25, k: 25, d: 10, map: "de_mirage",
    playedAt: 3 * DAY, url: "https://cybershoke.net/match/777", place: 1,
  });
});

test("best K/D ignores maps below the kills threshold", () => {
  const maps = [
    mapOf({ day: 1, players: [p("LOW", MIN_KILLS_FOR_KD - 1, 0, true), p("OK", MIN_KILLS_FOR_KD, 5, true)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "best-kd").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["OK"]);
  assert.equal(top[0].value, 3);
});

test("worst K/D ignores maps below the deaths threshold", () => {
  const maps = [
    mapOf({ day: 1, players: [p("FEW", 0, MIN_DEATHS_FOR_KD - 1, false), p("MANY", 5, MIN_DEATHS_FOR_KD, false)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "worst-kd").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["MANY"]);
  assert.equal(top[0].value, 0.5);
});

test("carry-in-loss only looks at maps the player's team lost", () => {
  const maps = [
    mapOf({ day: 1, players: [p("WIN", 40, 5, true), p("LOSS", 25, 20, false)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "carry-in-loss").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["LOSS"]);
  assert.equal(top[0].value, 5);
});

test("worst K-D diff and most deaths rank the other way round", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 5, 25, false), p("B", 10, 12, false), p("C", 20, 10, true)] }),
  ];
  const all = computeRecords(maps, sessionsOf(maps));
  // C с +10 — не «трудная карта»: в рекорд попадают только отрицательные разницы
  assert.deepEqual(rec(all, "worst-kd-diff").top.map((e) => e.steamid64), ["A", "B"]);
  assert.deepEqual(rec(all, "most-deaths").top.map((e) => e.steamid64), ["A", "B", "C"]);
});

test("win streak: skipped maps do not break it, a loss does, minimum length 2", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 10, 10, true)] }),
    mapOf({ day: 2, players: [p("B", 10, 10, true)] }), // A не играл — серию не рвёт
    mapOf({ day: 3, players: [p("A", 10, 10, true)] }),
    mapOf({ day: 4, players: [p("A", 10, 10, false)] }), // рвёт
    mapOf({ day: 5, players: [p("A", 10, 10, true)] }), // серия из 1
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "win-streak").top;
  assert.deepEqual(top, [{ steamid64: "A", value: 2, from: 1 * DAY, to: 3 * DAY, place: 1 }]);
});

test("K/D streak counts maps with K/D of at least 1.0", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 10, 10, false)] }), // 1.0 — засчитывается
    mapOf({ day: 2, players: [p("A", 12, 8, true)] }),
    mapOf({ day: 3, players: [p("A", 5, 10, true)] }), // рвёт
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "kd-streak").top;
  assert.deepEqual(top, [{ steamid64: "A", value: 2, from: 1 * DAY, to: 2 * DAY, place: 1 }]);
});

test("loss streak mirrors the win streak", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 5, 10, false)] }),
    mapOf({ day: 2, players: [p("A", 5, 10, false)] }),
    mapOf({ day: 3, players: [p("A", 5, 10, false)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "loss-streak").top;
  assert.deepEqual(top, [{ steamid64: "A", value: 3, from: 1 * DAY, to: 3 * DAY, place: 1 }]);
});

test("attendance streak: a missed session breaks it; range uses session start times", () => {
  const s1 = [mapOf({ day: 10, players: [p("A", 1, 1, true), p("B", 1, 1, true)] })];
  const s2 = [mapOf({ day: 20, players: [p("A", 1, 1, true)] })]; // B пропустил
  const s3 = [mapOf({ day: 30, players: [p("A", 1, 1, true), p("B", 1, 1, true)] })];
  const sessions = sessionsOf(s1, s2, s3);
  const top = rec(computeRecords([...s1, ...s2, ...s3], sessions), "attendance-streak").top;
  assert.deepEqual(top, [{ steamid64: "A", value: 3, from: 10 * DAY, to: 30 * DAY, place: 1 }]);
});

test("biggest win and closest match use the score difference; winner score comes first", () => {
  const maps = [
    mapOf({ day: 1, score: [13, 1], lobbyId: 1 , players: [p("A", 1, 1, true)] }),
    mapOf({ day: 2, score: [16, 14], lobbyId: 2, players: [p("A", 1, 1, true)] }),
    mapOf({ day: 3, score: [13, 12], lobbyId: 3, players: [p("A", 1, 1, true)] }),
  ];
  const all = computeRecords(maps, sessionsOf(maps));
  assert.deepEqual(rec(all, "biggest-win").top[0].score, [13, 1]);
  assert.equal(rec(all, "biggest-win").top[0].url, "https://cybershoke.net/match/1");
  // разница 1 у двух матчей (16:14 -> 2, 13:12 -> 1): упорнее 13:12
  assert.deepEqual(rec(all, "closest-match").top[0].score, [13, 12]);
});

test("closest match tie on difference goes to the longer map", () => {
  const maps = [
    mapOf({ day: 1, score: [13, 12], lobbyId: 1, players: [p("A", 1, 1, true)] }),
    mapOf({ day: 2, score: [19, 18], lobbyId: 2, players: [p("A", 1, 1, true)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "closest-match").top;
  assert.deepEqual(top.map((e) => e.score), [[19, 18], [13, 12]]);
});

test("longest and shortest map are ranked by rounds", () => {
  const maps = [
    mapOf({ day: 1, score: [13, 1], players: [p("A", 1, 1, true)] }),
    mapOf({ day: 2, score: [28, 25], players: [p("A", 1, 1, true)] }),
    mapOf({ day: 3, score: [13, 7], players: [p("A", 1, 1, true)] }),
  ];
  const all = computeRecords(maps, sessionsOf(maps));
  assert.deepEqual(rec(all, "longest-map").top.map((e) => e.rounds), [53, 20, 14]);
  assert.deepEqual(rec(all, "shortest-map").top.map((e) => e.rounds), [14, 20, 53]);
});

test("maps without both team scores are ignored by match records", () => {
  const broken = { ...mapOf({ day: 1, players: [p("A", 1, 1, true)] }), teams: [{ score: null }, { score: 5 }] };
  const all = computeRecords([broken], sessionsOf([broken]));
  assert.deepEqual(rec(all, "biggest-win").top, []);
  assert.deepEqual(rec(all, "longest-map").top, []);
  assert.equal(rec(all, "most-kills").top.length, 1); // личные записи по такой карте остаются
});

test("places: equal values share a place, the next one skips ahead", () => {
  const maps = [mapOf({ day: 1, players: [p("A", 30, 10, true), p("B", 25, 10, true), p("C", 25, 10, true), p("D", 10, 10, true)] })];
  const r = rec(computeRecords(maps, sessionsOf(maps)), "most-kills");
  assert.deepEqual(r.top.map((e) => [e.steamid64, e.place]), [["A", 1], ["B", 2], ["C", 2]]);
  assert.equal(r.more, 0); // D с другим значением — не «такой же результат»
});

test("more counts players tied with the last shown place who did not fit", () => {
  const maps = [mapOf({ day: 1, players: ["A", "B", "C", "D", "E"].map((id) => p(id, 20, 10, true)) })];
  const r = rec(computeRecords(maps, sessionsOf(maps)), "most-kills");
  assert.equal(r.top.length, 3);
  assert.deepEqual(r.top.map((e) => e.place), [1, 1, 1]);
  assert.equal(r.more, 2);
});

test("every record has a numeric more field", () => {
  assert.ok(computeRecords([], []).every((r) => r.more === 0));
});

test("two players tied on the same map are ordered by steamid64", () => {
  const maps = [mapOf({ day: 1, players: [p("B", 20, 10, true), p("A", 20, 10, true)] })];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "most-kills").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["A", "B"]);
});

test("a player with two equal results keeps the earlier one", () => {
  const maps = [
    mapOf({ day: 9, lobbyId: 9, players: [p("A", 20, 10, true)] }),
    mapOf({ day: 2, lobbyId: 2, players: [p("A", 20, 10, true)] }),
  ];
  const [e] = rec(computeRecords(maps, sessionsOf(maps)), "most-kills").top;
  assert.equal(e.playedAt, 2 * DAY);
  assert.equal(e.url, "https://cybershoke.net/match/2");
});

test("best K/D with zero deaths equals the kills", () => {
  const maps = [mapOf({ day: 1, players: [p("A", 20, 0, true), p("B", 26, 5, true)] })];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "best-kd").top;
  assert.deepEqual(top.map((e) => [e.steamid64, e.value]), [["A", 20], ["B", 5.2]]);
});

test("carry-in-loss ignores losses with a non-positive K-D", () => {
  const maps = [mapOf({ day: 1, players: [p("A", 10, 20, false), p("B", 15, 10, false)] })];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "carry-in-loss").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["B"]);
});

test("score is output winner first even if the input lists the loser first", () => {
  const m = { ...mapOf({ day: 1, players: [p("A", 1, 1, true)] }), teams: [{ score: 7 }, { score: 13 }] };
  const [e] = rec(computeRecords([m], sessionsOf([m])), "biggest-win").top;
  assert.deepEqual(e.score, [13, 7]);
});

test("rounds fall back to the score sum when totalRounds is missing", () => {
  const m = { ...mapOf({ day: 1, score: [13, 7], players: [p("A", 1, 1, true)] }), totalRounds: null };
  const [e] = rec(computeRecords([m], sessionsOf([m])), "longest-map").top;
  assert.equal(e.rounds, 20);
});

test("a drawn map counts neither as a win nor as a loss", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 10, 10, true), p("L", 10, 10, false)] }),
    mapOf({ day: 2, score: [15, 15], players: [p("A", 10, 10, false), p("L", 15, 5, false)] }), // ничья
    mapOf({ day: 3, players: [p("A", 10, 10, true), p("L", 10, 10, false)] }),
  ];
  const all = computeRecords(maps, sessionsOf(maps));
  assert.deepEqual(rec(all, "win-streak").top, []); // ничья рвёт серию побед A
  assert.deepEqual(rec(all, "loss-streak").top, []); // и серию поражений L
  assert.deepEqual(rec(all, "carry-in-loss").top.map((e) => e.steamid64), []); // L +10 на ничьей — не «проигрыш»
});

test("an unknown winner (won: null) is not a loss", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 20, 10, null)] }),
    mapOf({ day: 2, players: [p("A", 20, 10, null)] }),
  ];
  const all = computeRecords(maps, sessionsOf(maps));
  assert.deepEqual(rec(all, "loss-streak").top, []);
  assert.deepEqual(rec(all, "carry-in-loss").top, []);
});

test("streak ties: equal lengths share a place and overflow goes to more", () => {
  const maps = [1, 2].map((day) =>
    mapOf({ day, players: ["A", "B", "C", "D"].map((id) => p(id, 10, 10, true)) })
  );
  const r = rec(computeRecords(maps, sessionsOf(maps)), "win-streak");
  assert.deepEqual(r.top.map((e) => e.place), [1, 1, 1]);
  assert.equal(r.more, 1);
});

test("worst K-D diff only lists negative differences", () => {
  const maps = [mapOf({ day: 1, players: [p("A", 20, 10, true), p("B", 10, 12, false)] })];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "worst-kd-diff").top;
  assert.deepEqual(top.map((e) => e.steamid64), ["B"]);
});

test("attendance streak hint speaks about sessions, not evenings", () => {
  assert.equal(rec(computeRecords([], []), "attendance-streak").hint, "сессий подряд");
});

test("a 0/0 map neither breaks nor extends the K/D streak", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 12, 8, true)] }),
    mapOf({ day: 2, players: [p("A", 0, 0, false)] }), // игрок почти не играл — не считаем ни за, ни против
    mapOf({ day: 3, players: [p("A", 10, 10, true)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "kd-streak").top;
  assert.deepEqual(top, [{ steamid64: "A", value: 2, from: 1 * DAY, to: 3 * DAY, place: 1 }]);
});

test("a real K/D below 1.0 still breaks the streak next to a 0/0 map", () => {
  const maps = [
    mapOf({ day: 1, players: [p("A", 12, 8, true)] }),
    mapOf({ day: 2, players: [p("A", 0, 0, false)] }),
    mapOf({ day: 3, players: [p("A", 5, 10, true)] }),
    mapOf({ day: 4, players: [p("A", 10, 10, true)] }),
  ];
  const top = rec(computeRecords(maps, sessionsOf(maps)), "kd-streak").top;
  assert.deepEqual(top, []); // 1 + (0/0 не считается) | 5/10 рвёт | 1 — серий длиннее одной нет
});

test("the worst K/D record explains what it measures and its threshold", () => {
  const r = rec(computeRecords([], []), "worst-kd");
  assert.equal(r.title, "Карта не задалась (наименьший K/D)");
  assert.equal(r.hint, `считается минимум от ${MIN_DEATHS_FOR_KD} смертей на карте`);
});

// Железная посещаемость показывает ВСЕХ, кто делит первое место (решение 2026-10-22):
// это те, кто ходит с первой сессии и ни разу не пропустил, «и ещё N» тут только путало бы.
test("attendance streak shows every leader sharing first place, with nobody left in more", () => {
  const ids = ["A", "B", "C", "D", "E"];
  const sessions = sessionsOf(
    ...[1, 2, 3].map((day) => [mapOf({ day, players: ids.map((id) => p(id, 10, 10, true)) })])
  );
  const r = rec(computeRecords(sessions.flatMap((s) => s.maps), sessions), "attendance-streak");
  assert.equal(r.top.length, 5);
  assert.deepEqual(r.top.map((e) => e.place), [1, 1, 1, 1, 1]);
  assert.equal(r.more, 0);
});

test("attendance streak still fills up to three rows when there are fewer leaders", () => {
  const sessions = sessionsOf(
    [mapOf({ day: 1, players: ["A", "B", "C", "D"].map((id) => p(id, 10, 10, true)) })],
    [mapOf({ day: 2, players: ["A", "B", "C", "D"].map((id) => p(id, 10, 10, true)) })],
    [mapOf({ day: 3, players: ["A", "B"].map((id) => p(id, 10, 10, true)) })]
  );
  const r = rec(computeRecords(sessions.flatMap((s) => s.maps), sessions), "attendance-streak");
  assert.deepEqual(r.top.map((e) => [e.steamid64, e.value, e.place]), [["A", 3, 1], ["B", 3, 1], ["C", 2, 3]]);
  assert.equal(r.more, 1, "D has the same 2 as C and does not fit, as in every other record");
});
