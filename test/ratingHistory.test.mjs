import test from "node:test";
import assert from "node:assert/strict";
import { computeRatingHistory } from "../scripts/lib/ratingHistory.mjs";
import { computeAllTimeRating } from "../scripts/lib/allTimeRating.mjs";

const sessions = [
  { id: "2026-01-10", firstPlayedAt: 100 },
  { id: "2026-01-17", firstPlayedAt: 200 },
  { id: "2026-01-24", firstPlayedAt: 300 },
];

// matches[i].sessionId и history[i].after идут параллельно, как у build.mjs
function player(entries) {
  return {
    matches: entries.map(([sessionId]) => ({ sessionId })),
    history: entries.map(([, after]) => ({ before: 0, delta: 0, after })),
  };
}

test("output sessions keep order and only id/firstPlayedAt", () => {
  const out = computeRatingHistory(sessions, {});
  assert.deepEqual(out.sessions, [
    { id: "2026-01-10", firstPlayedAt: 100 },
    { id: "2026-01-17", firstPlayedAt: 200 },
    { id: "2026-01-24", firstPlayedAt: 300 },
  ]);
  assert.deepEqual(out.players, {});
});

test("a skipped session carries the previous rating forward", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 520], ["2026-01-24", 480]]),
  });
  assert.deepEqual(out.players.A, [520, 520, 480]);
});

test("sessions before the first played one are null", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-24", 530]]),
  });
  assert.deepEqual(out.players.A, [null, null, 530]);
});

test("a player who only played the first session stays flat afterwards", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 510]]),
  });
  assert.deepEqual(out.players.A, [510, 510, 510]);
});

test("the last map of a session decides that session's value", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 505], ["2026-01-10", 512], ["2026-01-17", 520]]),
  });
  assert.deepEqual(out.players.A, [512, 520, 520]);
});

test("ratings are rounded to integers", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 512.4], ["2026-01-17", 512.6]]),
  });
  assert.deepEqual(out.players.A, [512, 513, 513]);
});

test("no sessions gives empty arrays", () => {
  const out = computeRatingHistory([], { A: player([]) });
  assert.deepEqual(out, { sessions: [], players: { A: [] } });
});

test("several players are computed independently in one call", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 520], ["2026-01-24", 540]]),
    B: player([["2026-01-17", 480]]),
  });
  assert.deepEqual(out.players.A, [520, 520, 540]);
  assert.deepEqual(out.players.B, [null, 480, 480]);
});

test("a map whose session is not in the list is ignored", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["GHOST", 999], ["2026-01-10", 510]]),
  });
  assert.deepEqual(out.players.A, [510, 510, 510]);
});

test("the last value matches the real all-time rating from computeAllTimeRating", () => {
  const matches = [
    { sessionId: "2026-01-10", k: 20, d: 10, won: true },
    { sessionId: "2026-01-10", k: 5, d: 15, won: false },
    { sessionId: "2026-01-24", k: 18, d: 9, won: true },
  ];
  const { rating, history } = computeAllTimeRating(matches);
  const out = computeRatingHistory(sessions, { A: { matches, history } });
  assert.equal(out.players.A[2], Math.round(rating));
  assert.equal(out.players.A[1], out.players.A[0]); // в пропущенную сессию рейтинг не менялся
});
