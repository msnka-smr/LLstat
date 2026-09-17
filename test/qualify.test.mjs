import test from "node:test";
import assert from "node:assert/strict";
import { computeThreshold } from "../scripts/lib/qualify.mjs";

test("floor: while the leader has few maps, the minimum applies", () => {
  const threshold = computeThreshold([2, 5, 10], { qualifyShare: 0.3, qualifyMinMaps: 5 });
  // 30% of 10 = 3, but the floor of 5 wins
  assert.equal(threshold, 5);
});

test("share applies once the leader has enough maps", () => {
  const threshold = computeThreshold([10, 30, 50], { qualifyShare: 0.3, qualifyMinMaps: 5 });
  // 30% of 50 = 15
  assert.equal(threshold, 15);
});

test("threshold rounds up (ceil), not down", () => {
  const threshold = computeThreshold([17], { qualifyShare: 0.3, qualifyMinMaps: 0 });
  // 0.3 * 17 = 5.1 -> ceil to 6
  assert.equal(threshold, 6);
});

test("a player can fall out of qualification as the leader pulls ahead", () => {
  const before = computeThreshold([12, 15], { qualifyShare: 0.3, qualifyMinMaps: 5 });
  assert.ok(12 >= before, "12 maps qualifies when the leader has 15");

  const after = computeThreshold([12, 45], { qualifyShare: 0.3, qualifyMinMaps: 5 });
  assert.ok(12 < after, "the same 12 maps no longer qualifies once the leader reaches 45");
});
