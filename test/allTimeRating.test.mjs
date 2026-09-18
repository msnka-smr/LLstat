import test from "node:test";
import assert from "node:assert/strict";
import { computeAllTimeRating } from "../scripts/lib/allTimeRating.mjs";

test("starts new players at 500", () => {
  const { rating } = computeAllTimeRating([]);
  assert.equal(rating, 500);
});

test("delta = K * (result*0.3 + (kd-1.0)*0.8), fixed reference not a rolling average", () => {
  // 6-я карта, чтобы K=5 (не в первых пяти): K/D=2.0, победа.
  const priorMatches = Array(5).fill({ k: 12, d: 10, won: true }); // kd=1.2, K=8 каждая
  const sixthMatch = { k: 20, d: 10, won: true }; // kd=2.0
  const { history } = computeAllTimeRating([...priorMatches, sixthMatch]);

  const expectedDelta = Math.round(5 * (1 * 0.3 + (2.0 - 1.0) * 0.8) * 100) / 100;
  assert.equal(expectedDelta, 5.5, "5 * (0.3 + 0.8) = 5.5");
  assert.equal(history[5].delta, expectedDelta);
});

test("first 5 matches use K=8, matches after use K=5", () => {
  const winStreak = Array(10).fill({ k: 10, d: 10, won: true }); // kd=1.0 == база -> bonus=0
  const { history } = computeAllTimeRating(winStreak);
  assert.equal(history[0].delta, 8 * 0.3);
  assert.equal(history[4].delta, 8 * 0.3);
  assert.equal(history[5].delta, 5 * 0.3);
  assert.equal(history[9].delta, 5 * 0.3);
});

test("rating never leaves the 1-3500 range", () => {
  const badStreak = Array(200).fill({ k: 0, d: 20, won: false });
  const { rating } = computeAllTimeRating(badStreak);
  assert.ok(rating >= 1);

  const greatStreak = Array(200).fill({ k: 40, d: 1, won: true });
  const { rating: highRating } = computeAllTimeRating(greatStreak);
  assert.ok(highRating <= 3500);
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
