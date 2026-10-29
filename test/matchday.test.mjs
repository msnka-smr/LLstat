import test from "node:test";
import assert from "node:assert/strict";
import {
  MAP_POOL,
  parseSessionDate,
  parseMatchdayCommand,
  validatePayload,
  applyUpdate,
} from "../scripts/lib/matchday.mjs";

const NOW = new Date("2026-10-29T12:00:00Z");
const MAPS_LINE = "mirage nuke anubis inferno ancient dust2 cache";
const ORDER = ["de_mirage", "de_nuke", "de_anubis", "de_inferno", "de_ancient", "de_dust2", "de_cache"];
const id = (n) => "7656119800000000" + n;

// --- пул ---

test("в пуле ровно 7 карт в заданном порядке", () => {
  assert.deepEqual(MAP_POOL, ["de_mirage", "de_dust2", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_cache"]);
});

// --- дата ---

test("дата с годом разбирается в ISO", () => {
  assert.deepEqual(parseSessionDate("31.10.2026", NOW), { ok: true, iso: "2026-10-31" });
});

test("сегодняшняя дата допустима", () => {
  assert.equal(parseSessionDate("29.10.2026", NOW).ok, true);
});

test("вчерашняя дата — ошибка", () => {
  assert.equal(parseSessionDate("28.10.2026", NOW).ok, false);
});

test("дата без года — ошибка с подсказкой про ГГГГ", () => {
  const r = parseSessionDate("31.10", NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /ГГГГ/);
});

test("несуществующая дата 30.02.2026 — ошибка", () => {
  assert.equal(parseSessionDate("30.02.2026", NOW).ok, false);
});

test("«сегодня» считается по Москве: в 22:00 UTC там уже 30-е", () => {
  const late = new Date("2026-10-29T22:00:00Z");
  assert.equal(parseSessionDate("29.10.2026", late).ok, false);
  assert.equal(parseSessionDate("30.10.2026", late).ok, true);
});

// --- /maps ---

test("не команда — null", () => {
  assert.equal(parseMatchdayCommand("привет", NOW), null);
  assert.equal(parseMatchdayCommand("/start", NOW), null);
});

test("/maps с датой и 7 картами", () => {
  assert.deepEqual(parseMatchdayCommand(`/maps 31.10.2026 ${MAPS_LINE}`, NOW), {
    kind: "maps",
    payload: { order: ORDER },
    sessionDate: "2026-10-31",
  });
});

test("/maps без даты — sessionDate null", () => {
  assert.equal(parseMatchdayCommand(`/maps ${MAPS_LINE}`, NOW).sessionDate, null);
});

test("/MAPS@имя_бота с de_ и в верхнем регистре разбирается как /maps", () => {
  const r = parseMatchdayCommand("/MAPS@cs2_stats_tracking_bot DE_MIRAGE de_nuke anubis inferno ancient dust2 cache", NOW);
  assert.deepEqual(r.payload.order, ORDER);
});

test("/maps: 6 карт — ошибка", () => {
  assert.ok(parseMatchdayCommand("/maps mirage nuke anubis inferno ancient dust2", NOW).error);
});

test("/maps: 8 карт — ошибка", () => {
  assert.ok(parseMatchdayCommand(`/maps ${MAPS_LINE} mirage`, NOW).error);
});

test("/maps: повтор карты — ошибка", () => {
  assert.ok(parseMatchdayCommand("/maps mirage mirage anubis inferno ancient dust2 cache", NOW).error);
});

test("/maps: карта вне пула (train) — ошибка", () => {
  assert.ok(parseMatchdayCommand("/maps mirage nuke anubis inferno ancient dust2 train", NOW).error);
});

test("/maps: дата без года — ошибка про год, а не молча карта", () => {
  const r = parseMatchdayCommand(`/maps 31.10 ${MAPS_LINE}`, NOW);
  assert.match(r.error, /ГГГГ/);
});

// --- /teams ---

const teamsLine = (a, b) => `/teams 31.10.2026 ${a.join(", ")} | ${b.join(", ")}`;
const A = [`moloko=${id(1)}`, `Пикулинни=${id(2)}`, `Седой=${id(3)}`, `MrDrolik=${id(4)}`, "Вася~700"];
const B = [`a=${id(5)}`, `b=${id(6)}`, `c=${id(7)}`, `d=${id(8)}`, "Петя ~ 1500".replace(" ~ ", "~")];

test("/teams: игроки по steamid и гости", () => {
  const r = parseMatchdayCommand(teamsLine(A, B), NOW);
  assert.equal(r.kind, "teams");
  assert.equal(r.sessionDate, "2026-10-31");
  assert.deepEqual(r.payload.teamA[0], { steamid64: id(1) });
  assert.deepEqual(r.payload.teamA[4], { guest: "Вася", rating: 700 });
  assert.deepEqual(r.payload.teamB[4], { guest: "Петя", rating: 1500 });
  assert.equal(r.payload.teamA.length, 5);
  assert.equal(r.payload.teamB.length, 5);
});

test("/teams: имя игрока — только подпись, значим steamid после последнего =", () => {
  const r = parseMatchdayCommand(teamsLine([`а=б=${id(1)}`, ...A.slice(1)], B), NOW);
  assert.deepEqual(r.payload.teamA[0], { steamid64: id(1) });
});

test("/teams: игрок в обеих командах — ошибка", () => {
  assert.ok(parseMatchdayCommand(teamsLine(A, [`x=${id(1)}`, ...B.slice(1)]), NOW).error);
});

test("/teams: один игрок дважды в команде — ошибка", () => {
  assert.ok(parseMatchdayCommand(teamsLine([`x=${id(1)}`, `y=${id(1)}`, ...A.slice(2)], B), NOW).error);
});

test("/teams: в команде 4 человека — ошибка", () => {
  assert.ok(parseMatchdayCommand(teamsLine(A.slice(0, 4), B), NOW).error);
});

test("/teams: нет разделителя | — ошибка", () => {
  assert.ok(parseMatchdayCommand(`/teams ${A.concat(B).join(", ")}`, NOW).error);
});

test("/teams: рейтинг гостя 0, 1501, не число — ошибка", () => {
  for (const bad of ["Вася~0", "Вася~1501", "Вася~abc", "Вася~"]) {
    assert.ok(parseMatchdayCommand(teamsLine([...A.slice(0, 4), bad], B), NOW).error, bad);
  }
});

test("/teams: steamid не из 17 цифр — ошибка", () => {
  assert.ok(parseMatchdayCommand(teamsLine([`x=123`, ...A.slice(1)], B), NOW).error);
});

test("/teams: пустое имя гостя и имя из 41 символа — ошибка", () => {
  assert.ok(parseMatchdayCommand(teamsLine([...A.slice(0, 4), "~700"], B), NOW).error);
  assert.ok(parseMatchdayCommand(teamsLine([...A.slice(0, 4), "я".repeat(41) + "~700"], B), NOW).error);
  assert.ok(!parseMatchdayCommand(teamsLine([...A.slice(0, 4), "я".repeat(40) + "~700"], B), NOW).error);
});

test("/teams: дата без года перед командой — ошибка", () => {
  const line = `/teams 31.10 ${A.join(", ")} | ${B.join(", ")}`;
  assert.match(parseMatchdayCommand(line, NOW).error, /ГГГГ/);
});

test("/teams без даты — sessionDate null", () => {
  const line = `/teams ${A.join(", ")} | ${B.join(", ")}`;
  assert.equal(parseMatchdayCommand(line, NOW).sessionDate, null);
});

// --- validatePayload ---

test("validatePayload: 6 карт — строка ошибки, корректный набор — null", () => {
  assert.equal(typeof validatePayload("maps", { order: ORDER.slice(0, 6) }), "string");
  assert.equal(validatePayload("maps", { order: ORDER }), null);
});

test("validatePayload: неизвестный kind — ошибка", () => {
  assert.equal(typeof validatePayload("boom", {}), "string");
});

test("validatePayload teams: корректные команды — null, повтор — ошибка", () => {
  const ok = parseMatchdayCommand(teamsLine(A, B), NOW).payload;
  assert.equal(validatePayload("teams", ok), null);
  const dup = { teamA: ok.teamA, teamB: [ok.teamA[0], ...ok.teamB.slice(1)] };
  assert.equal(typeof validatePayload("teams", dup), "string");
});

// --- applyUpdate ---

test("applyUpdate из пустого: карты и дата", () => {
  const doc = applyUpdate(null, "maps", { order: ORDER }, "2026-10-31", "2026-10-29T10:00:00Z");
  assert.deepEqual(doc, { sessionDate: "2026-10-31", maps: { order: ORDER, savedAt: "2026-10-29T10:00:00Z" } });
});

test("applyUpdate без даты и без файла — sessionDate null", () => {
  assert.equal(applyUpdate(null, "maps", { order: ORDER }, null, "2026-10-29T10:00:00Z").sessionDate, null);
});

test("applyUpdate: составы без даты сохраняют карты и дату", () => {
  const before = applyUpdate(null, "maps", { order: ORDER }, "2026-10-31", "2026-10-29T10:00:00Z");
  const teams = parseMatchdayCommand(teamsLine(A, B), NOW).payload;
  const after = applyUpdate(before, "teams", teams, null, "2026-10-30T10:00:00Z");
  assert.equal(after.sessionDate, "2026-10-31");
  assert.deepEqual(after.maps, before.maps);
  assert.deepEqual(after.teams, { ...teams, savedAt: "2026-10-30T10:00:00Z" });
});

test("applyUpdate: новая дата заменяет прежнюю, обе части остаются", () => {
  let doc = applyUpdate(null, "maps", { order: ORDER }, "2026-10-31", "2026-10-29T10:00:00Z");
  doc = applyUpdate(doc, "teams", parseMatchdayCommand(teamsLine(A, B), NOW).payload, "2026-11-05", "2026-10-29T11:00:00Z");
  assert.equal(doc.sessionDate, "2026-11-05");
  assert.ok(doc.maps && doc.teams);
});

test("applyUpdate не мутирует входной документ", () => {
  const before = applyUpdate(null, "maps", { order: ORDER }, "2026-10-31", "2026-10-29T10:00:00Z");
  const copy = JSON.parse(JSON.stringify(before));
  applyUpdate(before, "teams", parseMatchdayCommand(teamsLine(A, B), NOW).payload, "2026-11-01", "2026-10-30T10:00:00Z");
  assert.deepEqual(before, copy);
});

test("applyUpdate: порядок ключей sessionDate, maps, teams", () => {
  let doc = applyUpdate(null, "teams", parseMatchdayCommand(teamsLine(A, B), NOW).payload, "2026-10-31", "2026-10-29T10:00:00Z");
  doc = applyUpdate(doc, "maps", { order: ORDER }, null, "2026-10-29T11:00:00Z");
  assert.deepEqual(Object.keys(doc), ["sessionDate", "maps", "teams"]);
});

// --- /reset ---

test("/reset — сброс MatchDay без данных и без даты", () => {
  assert.deepEqual(parseMatchdayCommand("/reset", NOW), { kind: "reset", payload: {}, sessionDate: null });
});

test("/RESET@имя_бота разбирается как /reset", () => {
  assert.equal(parseMatchdayCommand("/RESET@cs2_stats_tracking_bot", NOW).kind, "reset");
});

test("/reset с лишними аргументами — ошибка (чтобы не сбросить случайно)", () => {
  assert.ok(parseMatchdayCommand("/reset 31.10.2026", NOW).error);
  assert.ok(parseMatchdayCommand("/reset всё", NOW).error);
});

test("validatePayload reset: пустой объект допустим", () => {
  assert.equal(validatePayload("reset", {}), null);
});
