import test from "node:test";
import assert from "node:assert/strict";
import { calcSessionRating } from "../scripts/lib/sessionRating.mjs";

test("an average session (K/D=1, neutral diff, WR=50%) lands near the 500 baseline", () => {
  const matches = [
    { k: 10, d: 10, won: true },
    { k: 10, d: 10, won: false },
  ];
  assert.equal(calcSessionRating(matches), 500);
});

test("a dominant session lands well above baseline", () => {
  // K/D=1.61, avg diff +8.6/map, WR=57% — реальные цифры лидера сессии
  const matches = [
    { k: 23, d: 14, won: true },
    { k: 23, d: 14, won: true },
    { k: 23, d: 14, won: true },
    { k: 22, d: 14, won: false },
    { k: 22, d: 14, won: false },
    { k: 22, d: 14, won: false },
    { k: 23, d: 14, won: true },
  ];
  const rating = calcSessionRating(matches);
  assert.ok(rating > 700, `ожидали заметно выше базы, получили ${rating}`);
});

test("a rough session (net-negative frags every map) lands well below baseline", () => {
  const matches = Array(7).fill({ k: 8, d: 16, won: false });
  const rating = calcSessionRating(matches);
  assert.ok(rating < 400, `ожидали заметно ниже базы, получили ${rating}`);
});

test("K/D falls back to raw kills when deaths are zero", () => {
  const rating = calcSessionRating([{ k: 10, d: 0, won: true }]);
  assert.ok(rating > 500);
});

test("clamps to [1, 3500], never goes negative or past the new ceiling", () => {
  const disastrous = calcSessionRating(Array(10).fill({ k: 0, d: 30, won: false }));
  assert.equal(disastrous, 1);

  const godlike = calcSessionRating(Array(10).fill({ k: 60, d: 0, won: true }));
  assert.ok(godlike <= 3500);
});

test("returns null when there are no maps", () => {
  assert.equal(calcSessionRating([]), null);
});
