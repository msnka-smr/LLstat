import test from "node:test";
import assert from "node:assert/strict";
import { assignSessions } from "../scripts/lib/session.mjs";

const H = 3600;
function ts(y, m, d, h, min = 0) {
  return Math.floor(Date.UTC(y, m - 1, d, h, min) / 1000);
}

test("maps within the gap threshold join one session", () => {
  const maps = [];
  for (let i = 0; i < 7; i++) {
    maps.push({ playedAt: ts(2026, 1, 10, 4) + i * H, players: [] });
  }
  const { sessions } = assignSessions(maps, { gapHours: 6, timezone: "Europe/Samara" });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].maps.length, 7);
});

test("a gap larger than the threshold starts a new session", () => {
  const maps = [
    { playedAt: ts(2026, 1, 10, 4), players: [] },
    { playedAt: ts(2026, 1, 10, 5), players: [] },
    // 15 дней спустя — точно другая сессия
    { playedAt: ts(2026, 1, 25, 18), players: [] },
  ];
  const { sessions } = assignSessions(maps, { gapHours: 6, timezone: "Europe/Samara" });
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].maps.length, 2);
  assert.equal(sessions[1].maps.length, 1);
});

test("two sessions on the same local day get a -2 suffix", () => {
  const maps = [
    // Europe/Samara = UTC+4. 00:00 UTC = 04:00 местного, тот же календарный день.
    { playedAt: ts(2026, 3, 5, 0), players: [] },
    { playedAt: ts(2026, 3, 5, 1), players: [] },
    // разрыв 8 часов > 6, но всё ещё тот же местный день (09:00 UTC = 13:00 местного)
    { playedAt: ts(2026, 3, 5, 9), players: [] },
  ];
  const { sessions } = assignSessions(maps, { gapHours: 6, timezone: "Europe/Samara" });
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, "2026-03-05");
  assert.equal(sessions[1].id, "2026-03-05-2");
});

test("each map is stamped with its session id", () => {
  const maps = [
    { playedAt: ts(2026, 1, 10, 4), players: [] },
    { playedAt: ts(2026, 1, 25, 18), players: [] },
  ];
  const { maps: stamped } = assignSessions(maps, { gapHours: 6, timezone: "Europe/Samara" });
  assert.equal(stamped[0].sessionId, "2026-01-10");
  assert.equal(stamped[1].sessionId, "2026-01-25");
});
