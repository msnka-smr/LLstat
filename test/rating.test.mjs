import test from "node:test";
import assert from "node:assert/strict";
import { calculateRating, calculateImpact } from "../scripts/lib/rating.mjs";

test("calculateImpact matches the documented formula", () => {
  const impact = calculateImpact({ kpr: 0.75, apr: 0.15 });
  assert.ok(Math.abs(impact - 1.2505) < 1e-9);
});

test("calculateRating on a reference player matches a hand-computed value", () => {
  // KAST=72%, KPR=0.75, DPR=0.6, APR=0.15, ADR=80 — посчитано вручную по формуле из SPEC.md.
  const rating = calculateRating({ kast: 72, kpr: 0.75, dpr: 0.6, apr: 0.15, adr: 80 });
  assert.ok(Math.abs(rating - 1.19608) < 1e-3, `rating=${rating}`);
});

test("calculateRating: KAST is expected in percent, not a fraction", () => {
  const highKast = calculateRating({ kast: 90, kpr: 0.7, dpr: 0.7, apr: 0.15, adr: 75 });
  const lowKast = calculateRating({ kast: 50, kpr: 0.7, dpr: 0.7, apr: 0.15, adr: 75 });
  assert.ok(highKast > lowKast);
});
