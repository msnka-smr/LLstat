import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionOutput, buildSessionsOutput } from "../scripts/lib/sessionsOutput.mjs";

// makeRow в тестах — простая заглушка: build.mjs подставляет настоящий buildRow.
const makeRow = (steamid64, maps, rating) => ({
  steamid64,
  rating,
  isQualified: true,
  mapsPlayed: maps.length,
  rounds: maps.map((m) => m.mapTotalRounds),
});

function mapOf(lobbyId, players, extra = {}) {
  return {
    mapId: `${lobbyId}-0`,
    lobbyId,
    map: "de_dust2",
    statsTier: "full",
    teams: [{ score: 13 }, { score: 7 }],
    totalRounds: 20,
    players,
    ...extra,
  };
}

const strong = { steamid64: "A", k: 20, d: 10, won: true };
const weak = { steamid64: "B", k: 5, d: 10, won: false };

function sessionOf(id, maps) {
  return { id, firstPlayedAt: 1000, lastPlayedAt: 2000, maps };
}

test("sessions are output newest first", () => {
  const sessions = [
    sessionOf("2026-01-10", [mapOf(1, [strong])]),
    sessionOf("2026-01-25", [mapOf(2, [strong])]),
  ];
  const out = buildSessionsOutput(sessions, makeRow);
  assert.deepEqual(out.map((s) => s.id), ["2026-01-25", "2026-01-10"]);
});

test("no sessions gives an empty list", () => {
  assert.deepEqual(buildSessionsOutput([], makeRow), []);
});

test("same-day sessions keep their -2 suffix id", () => {
  const sessions = [
    sessionOf("2026-03-05", [mapOf(1, [strong])]),
    sessionOf("2026-03-05-2", [mapOf(2, [strong])]),
  ];
  const out = buildSessionsOutput(sessions, makeRow);
  assert.deepEqual(out.map((s) => s.id), ["2026-03-05-2", "2026-03-05"]);
});

test("each session only contains its own maps and players", () => {
  const sessions = [
    sessionOf("2026-01-10", [mapOf(1, [strong, weak])]),
    sessionOf("2026-01-25", [mapOf(2, [weak])]),
  ];
  const [newer, older] = buildSessionsOutput(sessions, makeRow);
  assert.deepEqual(newer.players.map((p) => p.steamid64), ["B"]);
  assert.deepEqual(older.players.map((p) => p.steamid64).sort(), ["A", "B"]);
  assert.equal(newer.maps.length, 1);
  assert.equal(newer.maps[0].lobbyId, 2);
});

test("players are sorted by session rating descending", () => {
  const out = buildSessionOutput(sessionOf("2026-01-10", [mapOf(1, [weak, strong])]), makeRow);
  assert.deepEqual(out.players.map((p) => p.steamid64), ["A", "B"]);
  assert.ok(out.players[0].rating > out.players[1].rating);
});

test("makeRow receives maps with the per-map round count", () => {
  const out = buildSessionOutput(sessionOf("2026-01-10", [mapOf(1, [strong], { totalRounds: 24 })]), makeRow);
  assert.deepEqual(out.players[0].rounds, [24]);
});

test("map entries carry the match url and tolerate missing teams", () => {
  const out = buildSessionOutput(
    sessionOf("2026-01-10", [mapOf(555, [strong], { teams: null })]),
    makeRow
  );
  assert.equal(out.maps[0].url, "https://cybershoke.net/match/555");
  assert.equal(out.maps[0].teams, null);
});

test("a single-player session is handled", () => {
  const out = buildSessionOutput(sessionOf("2026-01-10", [mapOf(1, [strong])]), makeRow);
  assert.equal(out.players.length, 1);
});

test("session output keeps its time range and the full map entries", () => {
  const out = buildSessionOutput(
    { id: "S", firstPlayedAt: 111, lastPlayedAt: 222, maps: [mapOf(7, [strong], { map: "de_nuke", statsTier: "basic" })] },
    makeRow
  );
  assert.equal(out.firstPlayedAt, 111);
  assert.equal(out.lastPlayedAt, 222);
  assert.deepEqual(out.maps[0], {
    mapId: "7-0", lobbyId: 7, map: "de_nuke", statsTier: "basic",
    teams: [{ score: 13 }, { score: 7 }], url: "https://cybershoke.net/match/7",
  });
});

test("the input sessions array is not mutated", () => {
  const sessions = [sessionOf("A", [mapOf(1, [strong])]), sessionOf("B", [mapOf(2, [strong])])];
  buildSessionsOutput(sessions, makeRow);
  assert.deepEqual(sessions.map((s) => s.id), ["A", "B"]);
});
