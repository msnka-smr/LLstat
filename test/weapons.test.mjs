import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

// docs/weapons.js — браузерный скрипт без сборки: кладёт себя в window.Weapons и
// берёт выбор периода у window.Duel (duel.js грузится раньше).
const sandbox = {};
vm.runInNewContext(readFileSync("docs/duel.js", "utf8"), sandbox);
vm.runInNewContext(readFileSync("docs/weapons.js", "utf8"), sandbox);
const W = sandbox.Weapons;
// Объекты из vm-контекста имеют чужие прототипы, а deepEqual строгий: приводим к простым.
const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

const DAY = 86400;
const NOW = 1_800_000_000;

// A: на новой карте AK 10 (6 в голову), M4A1 3, M4A4 2 (1 в голову), нож 1; на старой AK 5.
// B: AK 10 (2 в голову) и AWP 4. C: только гранаты. На карте без разбора демки (weapons: null) — ничего.
const sessions = [
  { id: 2, firstPlayedAt: NOW, lastPlayedAt: NOW + 100, maps: [
    { mapId: "m3", map: "de_nuke", weapons: null },
    { mapId: "m2", map: "de_mirage", weapons: {
      A: { "AK-47": [10, 6], M4A1: [3, 1], M4A4: [2, 1], Knife: [1, 0] },
      B: { "AK-47": [10, 2], AWP: [4, 1] },
      C: { "HE Grenade": [2, 0], Molotov: [1, 0] },
    } },
  ] },
  { id: 1, firstPlayedAt: NOW - 40 * DAY, lastPlayedAt: NOW - 40 * DAY + 100, maps: [
    { mapId: "m1", map: "de_dust2", weapons: { A: { "AK-47": [5, 0] }, Z: { "Weird Gun": [3, 3] } } },
  ] },
];

test("groupOf puts weapons into groups; M4A1 and M4A4 share one, unknown weapons go to «other»", () => {
  assert.equal(W.groupOf("AK-47"), "ak47");
  assert.equal(W.groupOf("M4A1"), "m4");
  assert.equal(W.groupOf("M4A4"), "m4");
  assert.equal(W.groupOf("MAG-7"), "shotguns");
  assert.equal(W.groupOf("Molotov"), "grenades");
  assert.equal(W.groupOf("Weird Gun"), "other");
});

test("every weapon seen in real data belongs to a named group, not «other»", () => {
  const stats = JSON.parse(readFileSync("docs/data/stats.json", "utf8"));
  const seen = new Set();
  for (const s of stats.sessions) for (const m of s.maps) for (const w of Object.values(m.weapons ?? {})) for (const name of Object.keys(w)) seen.add(name);
  assert.ok(seen.size > 10);
  assert.deepEqual([...seen].filter((n) => W.groupOf(n) === "other"), []);
});

test("computeStats sums kills and headshots per player and group across maps; maps without a demo are not counted", () => {
  const st = plain(W.computeStats(sessions, { period: "all" }));
  assert.equal(st.mapsTotal, 3);
  assert.equal(st.mapsCounted, 2);
  assert.deepEqual(st.players.A.groups.ak47, { kills: 15, hs: 6, weapons: { "AK-47": [15, 6] } });
  assert.deepEqual(st.players.A.groups.m4, { kills: 5, hs: 2, weapons: { M4A1: [3, 1], M4A4: [2, 1] } });
  assert.equal(st.players.A.kills, 21);
  assert.equal(st.players.C.groups.grenades.kills, 3);
});

test("period filters sessions: last5 keeps all here, month drops the session 40 days back", () => {
  assert.equal(plain(W.computeStats(sessions, { period: "last5" })).players.A.groups.ak47.kills, 15);
  const month = plain(W.computeStats(sessions, { period: "month" }));
  assert.equal(month.players.A.groups.ak47.kills, 10);
  assert.equal(month.mapsTotal, 2);
  assert.equal(month.players.Z, undefined);
});

test("leaders sorts by kills, ties share a place, hsPc is rounded and null without kills", () => {
  const st = W.computeStats(sessions, { period: "all" });
  const rows = plain(W.leaders(st, "ak47"));
  assert.deepEqual(rows, [
    { id: "A", kills: 15, hs: 6, hsPc: 40, place: 1 },
    { id: "B", kills: 10, hs: 2, hsPc: 20, place: 2 },
  ]);
  const tie = plain(W.leaders(W.computeStats(sessions, { period: "month" }), "ak47"));
  assert.deepEqual(tie.map((r) => [r.id, r.place]), [["A", 1], ["B", 1]], "равные убийства — одно место, выше тот, у кого больше хедшотов");
  assert.deepEqual(plain(W.leaders(st, "lmg")), []);
});

test("playerCard lists groups by kills with share, place among those who killed with it, and a favourite", () => {
  const st = W.computeStats(sessions, { period: "all" });
  const card = plain(W.playerCard(st, "A"));
  assert.equal(card.kills, 21);
  assert.equal(card.favorite, "ak47");
  assert.deepEqual(card.rows.map((r) => r.gid), ["ak47", "m4", "knife"]);
  assert.deepEqual(card.rows[0], { gid: "ak47", kills: 15, hs: 6, hsPc: 40, share: 71, place: 1, of: 2 });
  assert.equal(plain(W.playerCard(st, "nobody")), null);
});

test("compare marks the best cell in each row; zero is never best; HS% needs 5+ kills to count", () => {
  const st = W.computeStats(sessions, { period: "all" });
  const byKills = plain(W.compare(st, ["A", "B"], ["ak47", "awp"], "kills"));
  assert.deepEqual(byKills.rows[0].cells.map((c) => [c.id, c.kills, c.best]), [["A", 15, true], ["B", 10, false]]);
  assert.deepEqual(byKills.rows[1].cells.map((c) => [c.id, c.kills, c.best]), [["A", 0, false], ["B", 4, true]]);
  const byHs = plain(W.compare(st, ["A", "B"], ["awp"], "hsPc"));
  assert.deepEqual(byHs.rows[0].cells.map((c) => c.best), [false, false], "у B всего 4 убийства — не хватает для HS%");
});

test("every weapon group except «other» has an icon file that exists in docs/img/weapons", () => {
  const html = readFileSync("docs/index.html", "utf8");
  const block = /var WEAPON_IMAGES = \{([^}]*)\}/.exec(html)[1];
  const paths = Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  for (const g of W.GROUPS) {
    if (g.id === "other") continue;
    assert.ok(paths[g.id], `нет картинки для группы ${g.id}`);
    assert.ok(existsSync(`docs/${paths[g.id]}`), `нет файла ${paths[g.id]}`);
  }
});

// Убийства «за всё время» берутся из лобби, а оружие есть только у карт с демкой. cover считает,
// сколько карт и убийств игрока осталось без демки, чтобы страница могла объяснить разницу.
test("computeStats cover counts the player's maps and lobby kills on maps without a demo", () => {
  const withK = (m, kills) => ({ ...m, players: Object.entries(kills).map(([steamid64, k]) => ({ steamid64, k })) });
  const covered = [
    { id: 2, firstPlayedAt: NOW, lastPlayedAt: NOW + 100, maps: [
      withK({ mapId: "m3", map: "de_nuke", weapons: null }, { A: 12, B: 5 }),
      withK({ mapId: "m2", map: "de_mirage", weapons: { A: { "AK-47": [9, 3] } } }, { A: 10 }),
    ] },
    { id: 1, firstPlayedAt: NOW - 40 * DAY, lastPlayedAt: NOW - 40 * DAY + 100, maps: [
      withK({ mapId: "m1", map: "de_dust2", weapons: null }, { A: 7 }),
    ] },
  ];
  assert.deepEqual(plain(W.computeStats(covered, { period: "all" }).cover.A), { maps: 3, noDemoMaps: 2, noDemoKills: 19 });
  assert.deepEqual(plain(W.computeStats(covered, { period: "month" }).cover.A), { maps: 2, noDemoMaps: 1, noDemoKills: 12 }, "период учитывается");
  assert.deepEqual(plain(W.computeStats(covered, { period: "all" }).cover.B), { maps: 1, noDemoMaps: 1, noDemoKills: 5 });
  assert.equal(W.computeStats(covered, { period: "all" }).cover.Z, undefined);
});

test("on real data a player's demo kills plus lobby kills on no-demo maps stay close to the lobby total", () => {
  const stats = JSON.parse(readFileSync("docs/data/stats.json", "utf8"));
  const st = W.computeStats(stats.sessions, { period: "all" });
  const msn = stats.allTime.players.find((p) => p.name === "msn");
  const lobby = msn.k;
  const accounted = st.players[msn.steamid64].kills + st.cover[msn.steamid64].noDemoKills;
  assert.ok(Math.abs(lobby - accounted) <= 10, `лобби ${lobby}, по демкам + без демки ${accounted}`);
});
