import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// docs/session-teams.js — браузерный скрипт без сборки: кладёт себя в window.SessionTeams.
const sandbox = {};
vm.runInNewContext(readFileSync("docs/session-teams.js", "utf8"), sandbox);
const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const split = (s) => plain(sandbox.SessionTeams.split(s));

// Карта: одной строкой «команда: игроки», ключи команд на разных картах могут меняться местами.
const map = (id, teams) => ({
  mapId: id,
  players: Object.entries(teams).flatMap(([team, ids]) => ids.map((steamid64) => ({ steamid64, team }))),
});

test("two stable teams are split even when the team keys swap between maps", () => {
  const s = { maps: [
    map("m1", { team1: ["a", "b"], team2: ["c", "d"] }),
    map("m2", { team1: ["c", "d"], team2: ["a", "b"] }),
  ] };
  assert.deepEqual(split(s), { teamOf: { a: 0, b: 0, c: 1, d: 1 }, sizes: [2, 2] });
});

test("team 0 is the team of the first player on the first map", () => {
  const s = { maps: [map("m1", { t1: ["x", "y"], t2: ["z", "w"] })] };
  assert.equal(split(s).teamOf.x, 0);
  assert.equal(split(s).teamOf.z, 1);
});

test("a substitute who played for one team joins that team", () => {
  const s = { maps: [
    map("m1", { team1: ["a", "b", "c"], team2: ["d", "e", "f"] }),
    map("m2", { team1: ["a", "b", "sub"], team2: ["d", "e", "f"] }),
  ] };
  const r = split(s);
  assert.equal(r.teamOf.sub, r.teamOf.a);
  assert.deepEqual(r.sizes, [4, 3]);
});

test("no split when the teams were reshuffled during the evening", () => {
  const s = { maps: [
    map("m1", { team1: ["a", "b"], team2: ["c", "d"] }),
    map("m2", { team1: ["a", "c"], team2: ["b", "d"] }),
  ] };
  assert.equal(split(s), null);
});

test("no split without team info or with a single team", () => {
  assert.equal(split({ maps: [{ mapId: "m1", players: [{ steamid64: "a", team: null }, { steamid64: "b", team: null }] }] }), null);
  assert.equal(split({ maps: [map("m1", { team1: ["a", "b"] })] }), null);
  assert.equal(split({ maps: [] }), null);
});

test("a map without team info does not break the split of the others", () => {
  const s = { maps: [
    { mapId: "m0", players: [{ steamid64: "a", team: null }, { steamid64: "c", team: null }] },
    map("m1", { team1: ["a", "b"], team2: ["c", "d"] }),
  ] };
  assert.deepEqual(split(s).sizes, [2, 2]);
});

test("every real session in stats.json is split into two teams of the same players the table shows", () => {
  const stats = JSON.parse(readFileSync("docs/data/stats.json", "utf8"));
  let splitCount = 0;
  for (const s of stats.sessions) {
    const r = split(s);
    if (!r) continue;
    splitCount++;
    assert.equal(r.sizes.length, 2);
    assert.equal(r.sizes[0] + r.sizes[1], Object.keys(r.teamOf).length);
  }
  assert.ok(splitCount >= 8, `команды определились только у ${splitCount} сессий`);
});
