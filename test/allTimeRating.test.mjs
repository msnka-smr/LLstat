import test from "node:test";
import assert from "node:assert/strict";
import { computeAllTimeRating, computeRatingDelta } from "../scripts/lib/allTimeRating.mjs";

test("starts new players at 1000", () => {
  const { rating } = computeAllTimeRating([]);
  assert.equal(rating, 1000);
});

test("delta = K * (result*0.2 + (kd-1.0)*0.8), fixed reference not a rolling average", () => {
  // 6-я карта, чтобы K=10 (не в первых пяти): K/D=2.0, победа.
  const priorMatches = Array(5).fill({ k: 12, d: 10, won: true }); // kd=1.2, K=16 каждая
  const sixthMatch = { k: 20, d: 10, won: true }; // kd=2.0
  const { history } = computeAllTimeRating([...priorMatches, sixthMatch]);

  const expectedDelta = Math.round(10 * (1 * 0.2 + (2.0 - 1.0) * 0.8) * 100) / 100;
  assert.equal(expectedDelta, 10, "10 * (0.2 + 0.8) = 10");
  assert.equal(history[5].delta, expectedDelta);
});

test("first 5 matches use K=16, matches after use K=10", () => {
  const winStreak = Array(10).fill({ k: 10, d: 10, won: true }); // kd=1.0 == база -> bonus=0
  const { history } = computeAllTimeRating(winStreak);
  assert.equal(history[0].delta, 16 * 0.2);
  assert.equal(history[4].delta, 16 * 0.2);
  assert.equal(history[5].delta, 10 * 0.2);
  assert.equal(history[9].delta, 10 * 0.2);
});

test("rating never leaves the 0-5000 range", () => {
  const badStreak = Array(200).fill({ k: 0, d: 20, won: false });
  const { rating } = computeAllTimeRating(badStreak);
  assert.ok(rating >= 0);
  assert.equal(rating, 0, "дно шкалы достигается и держится на 0");

  const greatStreak = Array(200).fill({ k: 40, d: 1, won: true });
  const { rating: highRating } = computeAllTimeRating(greatStreak);
  assert.equal(highRating, 5000, "потолок шкалы достигается и держится на 5000");
});

// Регрессия на тот самый реальный кейс, который заставил пересмотреть формулу:
// игрок с явно лучшим K/D, но неудачным винрейтом (плохой состав команды),
// должен в итоге обойти игрока со слабым K/D, но удачным винрейтом — раньше
// личный бонус усреднялся к нулю относительно своего же среднего, и решал
// только счёт побед/поражений.
test("a player with a clearly better K/D outranks one with only a better win rate", () => {
  const goodKdBadWr = [];
  for (let i = 0; i < 32; i++) {
    goodKdBadWr.push({ k: 19, d: 16, won: i % 8 < 3 }); // kd≈1.19, WR=3/8=37.5%
  }
  const badKdGoodWr = [];
  for (let i = 0; i < 32; i++) {
    badKdGoodWr.push({ k: 14, d: 18, won: i % 8 < 5 }); // kd≈0.78, WR=5/8=62.5%
  }

  const good = computeAllTimeRating(goodKdBadWr).rating;
  const bad = computeAllTimeRating(badKdGoodWr).rating;
  assert.ok(good > bad, `игрок с K/D≈1.19 (${good}) должен обойти игрока с K/D≈0.78 (${bad}), даже с худшим WR`);
});

test("computeRatingDelta is 0 when there is no last session", () => {
  const matches = [{ k: 10, d: 10, won: true, sessionId: "2026-01-01" }];
  const { history } = computeAllTimeRating(matches);
  assert.equal(computeRatingDelta(matches, history, null), 0);
});

test("computeRatingDelta is 0 when the player didn't play the last session", () => {
  const matches = Array(6).fill({ k: 10, d: 10, won: true, sessionId: "2026-01-01" });
  const { history } = computeAllTimeRating(matches);
  assert.equal(computeRatingDelta(matches, history, "2026-01-02"), 0);
});

test("computeRatingDelta sums the rounded rating change across the last session's maps", () => {
  const older = Array(6).fill({ k: 10, d: 10, won: true, sessionId: "2026-01-01" }); // kd=1.0, K=10 после 5-й карты
  const lastSession = [
    { k: 20, d: 10, won: true, sessionId: "2026-01-02" }, // kd=2.0
    { k: 20, d: 10, won: true, sessionId: "2026-01-02" },
  ];
  const matches = [...older, ...lastSession];
  const { history } = computeAllTimeRating(matches);

  const before = Math.round(history[6].before);
  const after = Math.round(history[7].after);
  assert.equal(computeRatingDelta(matches, history, "2026-01-02"), after - before);
  assert.ok(after - before > 0, "хороший K/D в последней сессии должен дать положительную дельту");
});

test("computeRatingDelta is 0 when a mixed session nets out to zero", () => {
  // established (K=10), победа с kd=0.75 даёт delta = 10*(0.2 + (0.75-1)*0.8) = 0 ровно
  const older = Array(5).fill({ k: 10, d: 10, won: true, sessionId: "2026-01-01" });
  const zeroNetMatch = { k: 6, d: 8, won: true, sessionId: "2026-01-02" };
  const matches = [...older, zeroNetMatch];
  const { history } = computeAllTimeRating(matches);

  assert.ok(Math.abs(history[5].delta) < 1e-9, `дельта карты должна быть ~0, получили ${history[5].delta}`);
  assert.equal(computeRatingDelta(matches, history, "2026-01-02"), 0);
});
