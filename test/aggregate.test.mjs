import test from "node:test";
import assert from "node:assert/strict";
import { aggregatePlayerMaps } from "../scripts/lib/aggregate.mjs";

test("rating inputs are weighted by rounds, not averaged per map", () => {
  // Короткая карта-разгром (13 раундов) не должна весить столько же, сколько
  // затяжная с овертаймами (30 раундов).
  const maps = [
    { statsTier: "full", rounds: 13, k: 20, d: 5, a: 2, adr: 200, kast: 90, won: true },
    { statsTier: "full", rounds: 30, k: 20, d: 25, a: 5, adr: 50, kast: 60, won: false },
  ];
  const agg = aggregatePlayerMaps(maps);

  const weightedKpr = 40 / 43;
  const weightedAdr = (200 * 13 + 50 * 30) / 43;
  const weightedKast = (90 * 13 + 60 * 30) / 43;
  const naiveAvgKpr = (20 / 13 + 20 / 30) / 2;

  assert.ok(Math.abs(agg.kpr - weightedKpr) < 1e-9);
  assert.ok(Math.abs(agg.adr - weightedAdr) < 1e-9);
  assert.ok(Math.abs(agg.kast - weightedKast) < 1e-9);
  assert.notEqual(Math.abs(agg.kpr - naiveAvgKpr) < 1e-9, true, "must not equal the naive per-map average");
});

test("basic-tier maps count toward K/D/A/maps but not toward rating inputs", () => {
  const maps = [
    { statsTier: "full", rounds: 16, k: 16, d: 16, a: 0, adr: 80, kast: 70, won: true },
    { statsTier: "basic", rounds: null, k: 10, d: 20, a: 3, adr: null, kast: null, won: false },
  ];
  const agg = aggregatePlayerMaps(maps);

  assert.equal(agg.mapsPlayed, 2);
  assert.equal(agg.k, 26);
  assert.equal(agg.d, 36);
  assert.equal(agg.a, 3);
  assert.equal(agg.fullTierMaps, 1);
  assert.equal(agg.fullTierRounds, 16);
  assert.ok(Math.abs(agg.kpr - 16 / 16) < 1e-9, "kpr should come only from the full-tier map");
});

test("a player with no full-tier maps has no rating", () => {
  const maps = [{ statsTier: "basic", rounds: null, k: 10, d: 10, a: 1, adr: null, kast: null, won: true }];
  const agg = aggregatePlayerMaps(maps);
  assert.equal(agg.rating, null);
});
