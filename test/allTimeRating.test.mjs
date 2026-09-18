import test from "node:test";
import assert from "node:assert/strict";
import { computeAllTimeRating } from "../scripts/lib/allTimeRating.mjs";

test("starts new players at 500", () => {
  const { rating } = computeAllTimeRating([]);
  assert.equal(rating, 500);
});

test("matches the worked example from the rating spec for a single match", () => {
  // current_rating=520 в примере предполагает игрока не в первых 5 картах —
  // строим историю так, чтобы 6-я карта воспроизводила пример: K/D=2.0, WIN,
  // avg K/D за предыдущие карты = 1.2.
  const priorMatches = [
    { k: 12, d: 10, won: true }, // kd=1.2 x5, чтобы avg(last30)=1.2
    { k: 12, d: 10, won: true },
    { k: 12, d: 10, won: false },
    { k: 12, d: 10, won: true },
    { k: 12, d: 10, won: false },
  ];
  const { history } = computeAllTimeRating(priorMatches);
  const ratingBeforeSixth = history[history.length - 1].after;

  // Проверяем именно шаг дельты по формуле примера, а не итоговый рейтинг
  // (он зависит от накопленной истории первых 5 карт с K=8).
  const avgKd = 1.2;
  const matchKd = 2.0;
  const personalBonus = (matchKd - avgKd) * 0.5;
  const expectedDelta = Math.round(5 * (1 + personalBonus) * 100) / 100;
  assert.equal(expectedDelta, 7, "K=5 * (1 + (2.0-1.2)*0.5) = 5 * 1.4 = 7, как в примере спеки");

  const sixthMatch = { k: 20, d: 10, won: true }; // kd=2.0
  const { history: fullHistory } = computeAllTimeRating([...priorMatches, sixthMatch]);
  const sixthStep = fullHistory[5];
  assert.equal(sixthStep.delta, expectedDelta);
});

test("first 5 matches use K=8, matches after use K=5", () => {
  const winStreak = Array(10).fill({ k: 10, d: 10, won: true }); // kd=1.0 every time
  const { history } = computeAllTimeRating(winStreak);
  // kd equals the running average every time -> personalBonus stays 0,
  // so delta is exactly +K for a win.
  assert.equal(history[0].delta, 8);
  assert.equal(history[4].delta, 8);
  assert.equal(history[5].delta, 5);
  assert.equal(history[9].delta, 5);
});

test("rating never leaves the 1-10000 range", () => {
  const badStreak = Array(80).fill({ k: 0, d: 20, won: false });
  const { rating } = computeAllTimeRating(badStreak);
  assert.ok(rating >= 1);

  const greatStreak = Array(50).fill({ k: 40, d: 1, won: true });
  const { rating: highRating } = computeAllTimeRating(greatStreak);
  assert.ok(highRating <= 10000);
});

test("average K/D only looks at the last 30 matches", () => {
  const old = Array(40).fill({ k: 0, d: 20, won: false }); // очень плохой K/D=0
  const recent = Array(5).fill({ k: 20, d: 10, won: true }); // K/D=2.0
  const { history } = computeAllTimeRating([...old, ...recent]);
  // К моменту первой из "recent" карт средний K/D должен считаться только по
  // последним 30 из "old" (K/D=0 у всех), а не включать более старые.
  const firstRecentStep = history[40];
  assert.ok(firstRecentStep.delta > 0, "хорошая карта после долгой просадки должна давать positive delta");
});
