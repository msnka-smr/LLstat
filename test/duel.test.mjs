import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// docs/duel.js — браузерный скрипт без сборки: кладёт себя в window.Duel.
const sandbox = {};
vm.runInNewContext(readFileSync("docs/duel.js", "utf8"), sandbox);
// Объекты из vm-контекста имеют чужие прототипы, а deepEqual строгий: приводим к простым.
const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const computeDuel = (...args) => plain(sandbox.Duel.computeDuel(...args));
const parseDuelHash = (h) => plain(sandbox.Duel.parseDuelHash(h));
const duelHash = sandbox.Duel.duelHash;

const DAY = 86400;
const NOW = 1_800_000_000;

// A и B — соперники на m1 (A выиграл) и m2 (B выиграл), в одной команде на m3 (победа),
// на m4 соперники, но без разбора демки; C не участвует.
function map(id, map, teamA, teamB, winnerKey, kills) {
  return {
    mapId: id, map,
    teams: [
      { key: "t1", isWinner: winnerKey === "t1" },
      { key: "t2", isWinner: winnerKey === "t2" },
    ],
    players: [
      { steamid64: "A", team: teamA },
      { steamid64: "B", team: teamB },
      { steamid64: "C", team: "t2" },
    ],
    duels: kills ?? null,
  };
}
const sessions = [
  { id: 3, firstPlayedAt: NOW, lastPlayedAt: NOW + 100, maps: [
    map("m4", "de_nuke", "t1", "t2", "t1", null),
    map("m3", "de_mirage", "t1", "t1", "t1", { kills: { A: { C: 1 } } }),
  ] },
  { id: 2, firstPlayedAt: NOW - 10 * DAY, lastPlayedAt: NOW - 10 * DAY + 100, maps: [
    map("m2", "de_dust2", "t1", "t2", "t2", { kills: { A: { B: 3 }, B: { A: 10 } } }),
  ] },
  { id: 1, firstPlayedAt: NOW - 100 * DAY, lastPlayedAt: NOW - 100 * DAY + 100, maps: [
    map("m1", "de_inferno", "t2", "t1", "t2", { kills: { A: { B: 14 }, B: { A: 4 } } }),
  ] },
];

test("убийства, счёт по картам и K/D считаются только по картам с разбором, где игроки соперники", () => {
  const d = computeDuel(sessions, "A", "B");
  assert.equal(d.killsA, 17);
  assert.equal(d.killsB, 14);
  assert.equal(d.maps.length, 2);
  assert.equal(d.winsA, 1);
  assert.equal(d.winsB, 1);
  assert.equal(d.draws, 0);
  assert.equal(d.kd, 17 / 14);
});

test("карта без разбора демки попадает в skipped и не влияет на счёт", () => {
  const d = computeDuel(sessions, "A", "B");
  assert.deepEqual(d.skipped.map((m) => m.mapId), ["m4"]);
});

test("«вместе»: карты в одной команде и победы, включая карты без разбора", () => {
  const d = computeDuel(sessions, "A", "B");
  assert.deepEqual(d.together, { maps: 1, wins: 1 });
});

test("история идёт от новых карт к старым, у карты есть победитель и счёт убийств", () => {
  const d = computeDuel(sessions, "A", "B");
  assert.deepEqual(d.maps.map((m) => [m.mapId, m.a, m.b, m.winner]), [
    ["m2", 3, 10, "b"],
    ["m1", 14, 4, "a"],
  ]);
});

test("общая история включает и карты без разбора, от новых к старым", () => {
  const d = computeDuel(sessions, "A", "B");
  assert.deepEqual(d.history.map((m) => m.mapId), ["m4", "m2", "m1"]);
  const twoMaps = [{ id: 9, firstPlayedAt: NOW, lastPlayedAt: NOW, maps: [
    map("first", "de_nuke", "t1", "t2", "t1", { kills: { A: { B: 1 } } }),
    map("second", "de_nuke", "t1", "t2", "t1", { kills: { A: { B: 1 } } }),
  ] }];
  assert.deepEqual(computeDuel(twoMaps, "A", "B").history.map((m) => m.mapId), ["second", "first"]);
});

test("рекорды: самая кровавая карта и самый крупный перевес", () => {
  const d = computeDuel(sessions, "A", "B");
  assert.equal(d.bloodiest.mapId, "m1"); // 18 против 13
  assert.equal(d.biggest.mapId, "m1");   // перевес 10 против 7
  assert.equal(d.biggest.leader, "a");
});

test("порядок игроков меняет сторону, но не итог", () => {
  const ab = computeDuel(sessions, "A", "B");
  const ba = computeDuel(sessions, "B", "A");
  assert.equal(ba.killsA, ab.killsB);
  assert.equal(ba.killsB, ab.killsA);
  assert.equal(ba.winsA, ab.winsB);
  assert.equal(ba.biggest.leader, "a" === ab.biggest.leader ? "b" : "a");
});

test("период: последний месяц и последние 5 вечеров", () => {
  assert.equal(computeDuel(sessions, "A", "B", { period: "month" }).maps.length, 1);
  assert.equal(computeDuel(sessions, "A", "B", { period: "last5" }).maps.length, 2);
  assert.equal(computeDuel([...sessions, ...sessions, ...sessions].slice(0, 3), "A", "B", { period: "last5" }).maps.length, 2);
});

test("пустая дуэль не падает: нет записей, нет рекордов, K/D = null", () => {
  const d = computeDuel(sessions, "A", "Z");
  assert.equal(d.maps.length, 0);
  assert.equal(d.killsA + d.killsB, 0);
  assert.equal(d.bloodiest, null);
  assert.equal(d.biggest, null);
  assert.equal(d.kd, null);
  assert.equal(computeDuel(sessions, "A", "A"), null);
});

test("ссылка на пару: разбор и сборка хеша, мусор игнорируется", () => {
  assert.equal(duelHash("A", "B", "month"), "#duel=A,B,month");
  assert.deepEqual(parseDuelHash("#duel=A,B,month"), { a: "A", b: "B", period: "month" });
  assert.deepEqual(parseDuelHash("#duel=A,B"), { a: "A", b: "B", period: "all" });
  assert.deepEqual(parseDuelHash("#duel=A,B,forever"), { a: "A", b: "B", period: "all" });
  assert.equal(parseDuelHash(""), null);
  assert.equal(parseDuelHash("#other"), null);
  assert.equal(parseDuelHash("#duel=A"), null);
});

test("на реальных данных для любой пары счёт согласован с матрицей", () => {
  const stats = JSON.parse(readFileSync("docs/data/stats.json", "utf8"));
  const ids = stats.allTime.players.map((p) => p.steamid64);
  let pairsWithMaps = 0;
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const d = computeDuel(stats.sessions, a, b);
    const r = computeDuel(stats.sessions, b, a);
    assert.equal(d.killsA, r.killsB);
    assert.equal(d.winsA + d.winsB + d.draws, d.maps.length);
    assert.equal(d.killsA, d.maps.reduce((s, m) => s + m.a, 0));
    if (d.maps.length) pairsWithMaps++;
  }
  assert.ok(pairsWithMaps > 0, "на реальных данных должна найтись хоть одна пара соперников");
});
