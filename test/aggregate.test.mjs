import test from "node:test";
import assert from "node:assert/strict";
import { aggregatePlayerMaps } from "../scripts/lib/aggregate.mjs";

test("sums K/D and win/loss counts across all maps", () => {
  const maps = [
    { k: 20, d: 5, won: true },
    { k: 10, d: 15, won: false },
  ];
  const agg = aggregatePlayerMaps(maps);

  assert.equal(agg.mapsPlayed, 2);
  assert.equal(agg.wins, 1);
  assert.equal(agg.losses, 1);
  assert.equal(agg.k, 30);
  assert.equal(agg.d, 20);
  assert.equal(agg.kd, 30 / 20);
});

test("K/D falls back to raw kills when there are no deaths", () => {
  const agg = aggregatePlayerMaps([{ k: 5, d: 0, won: true }]);
  assert.equal(agg.kd, 5);
});

test("an empty map list yields all zeros", () => {
  const agg = aggregatePlayerMaps([]);
  assert.equal(agg.mapsPlayed, 0);
  assert.equal(agg.wins, 0);
  assert.equal(agg.losses, 0);
  assert.equal(agg.k, 0);
  assert.equal(agg.d, 0);
  assert.equal(agg.kd, 0);
});
