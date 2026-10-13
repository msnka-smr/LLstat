import test from "node:test";
import assert from "node:assert/strict";
import { computeRecap, TOP_N, START_RATING } from "../scripts/lib/recap.mjs";

const row = (steamid64, rating, extra = {}) => ({
  steamid64, rating, kd: 1.5, kdDiff: 10, wins: 2, mapsPlayed: 3, isQualified: true, ...extra,
});
const session = (id, players) => ({ id, players });
const history = (ids, players) => ({ sessions: ids.map((id) => ({ id })), players });

test("top lists the best three by session rating, MVP first", () => {
  const s = session("S1", [row("A", 500), row("B", 800), row("C", 650), row("D", 700)]);
  const { top } = computeRecap(s, undefined);
  assert.equal(TOP_N, 3);
  assert.deepEqual(top.map((t) => t.steamid64), ["B", "D", "C"]);
});

test("top entries carry rating, rounded kd, kdDiff, wins and maps", () => {
  const s = session("S1", [row("A", 700, { kd: 1.23456, kdDiff: 7, wins: 4, mapsPlayed: 5 })]);
  assert.deepEqual(computeRecap(s, undefined).top, [
    { steamid64: "A", rating: 700, kd: 1.23, kdDiff: 7, wins: 4, maps: 5 },
  ]);
});

test("equal rating: higher K-D difference first, then steamid64", () => {
  const s = session("S1", [
    row("C", 700, { kdDiff: 5 }),
    row("B", 700, { kdDiff: 9 }),
    row("A", 700, { kdDiff: 5 }),
  ]);
  assert.deepEqual(computeRecap(s, undefined).top.map((t) => t.steamid64), ["B", "A", "C"]);
});

test("an unqualified player can be the MVP", () => {
  const s = session("S1", [row("Q", 600), row("GUEST", 900, { isQualified: false })]);
  assert.equal(computeRecap(s, undefined).top[0].steamid64, "GUEST");
});

test("fewer than three players give a shorter top", () => {
  assert.equal(computeRecap(session("S1", [row("A", 600), row("B", 500)]), undefined).top.length, 2);
});

test("an empty session gives an empty recap", () => {
  assert.deepEqual(computeRecap(session("S1", []), history(["S1"], {})), { top: [], rise: null, drop: null });
});

test("rise and drop come from the change in all-time rating over the session", () => {
  const h = history(["S1", "S2"], { A: [530, 560], B: [510, 490], C: [null, 505], D: [520, 520] });
  const s = session("S2", [row("A", 700), row("B", 650), row("C", 600), row("D", 550)]);
  const { rise, drop } = computeRecap(s, h);
  assert.deepEqual(rise, { steamid64: "A", delta: 30 }); // C: +5 (до — старт 500), A: +30
  assert.deepEqual(drop, { steamid64: "B", delta: -20 });
});

test("the first session measures the change from the starting rating", () => {
  const h = history(["S1", "S2"], { A: [530, 540], B: [510, 510] });
  const { rise, drop } = computeRecap(session("S1", [row("A", 700), row("B", 600)]), h);
  assert.deepEqual(rise, { steamid64: "A", delta: 30 });
  assert.equal(drop, null);
  assert.equal(START_RATING, 500);
});

test("rise is null when nobody grew, drop is null when nobody fell", () => {
  const h = history(["S1", "S2"], { A: [520, 520], B: [510, 500] });
  const { rise, drop } = computeRecap(session("S2", [row("A", 700), row("B", 600)]), h);
  assert.equal(rise, null);
  assert.deepEqual(drop, { steamid64: "B", delta: -10 });
});

test("only players of this session count for rise and drop", () => {
  const h = history(["S1", "S2"], { A: [520, 530], HUGE: [500, 900] });
  const { rise } = computeRecap(session("S2", [row("A", 700)]), h);
  assert.deepEqual(rise, { steamid64: "A", delta: 10 });
});

test("equal deltas are ordered by steamid64", () => {
  const h = history(["S1"], { B: [520], A: [520] });
  const { rise } = computeRecap(session("S1", [row("B", 600), row("A", 600)]), h);
  assert.equal(rise.steamid64, "A");
});

test("no history or an unknown session gives null rise and drop", () => {
  const s = session("S1", [row("A", 600)]);
  const none = computeRecap(s, undefined);
  assert.equal(none.rise, null);
  assert.equal(none.drop, null);
  const other = history(["X"], { A: [999] });
  const out = computeRecap(s, other);
  assert.equal(out.rise, null);
  assert.equal(out.drop, null);
});

test("a missing rating sorts last and does not break the order", () => {
  const s = session("S1", [row("A", null), row("B", 600), row("C", 700)]);
  assert.deepEqual(computeRecap(s, undefined).top.map((x) => x.steamid64), ["C", "B", "A"]);
});

test("at equal rating a missing K-D difference ranks below a known one", () => {
  const s = session("S1", [row("A", 700, { kdDiff: null }), row("B", 700, { kdDiff: -5 })]);
  assert.deepEqual(computeRecap(s, undefined).top.map((x) => x.steamid64), ["B", "A"]);
});

test("a missing kd stays null instead of becoming NaN", () => {
  const [top] = computeRecap(session("S1", [row("A", 700, { kd: null })]), undefined).top;
  assert.equal(top.kd, null);
});

test("a session player who is absent from the history is skipped", () => {
  const h = history(["S1"], { A: [530] });
  const { rise } = computeRecap(session("S1", [row("A", 700), row("NOHIST", 650)]), h);
  assert.deepEqual(rise, { steamid64: "A", delta: 30 });
});

test("equal drops are ordered by steamid64", () => {
  const h = history(["S1", "S2"], { B: [520, 510], A: [520, 510] });
  const { drop } = computeRecap(session("S2", [row("B", 600), row("A", 600)]), h);
  assert.deepEqual(drop, { steamid64: "A", delta: -10 });
});
