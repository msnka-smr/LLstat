import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORDER = ["de_mirage", "de_nuke", "de_anubis", "de_inferno", "de_ancient", "de_dust2", "de_cache"];
const TEAMS = {
  teamA: [1, 2, 3, 4].map((n) => ({ steamid64: "7656119800000000" + n })).concat([{ guest: "Вася", rating: 700 }]),
  teamB: [5, 6, 7, 8].map((n) => ({ steamid64: "7656119800000000" + n })).concat([{ guest: "Петя", rating: 900 }]),
};

function run(file, { kind, payload, date = "" }) {
  return spawnSync(process.execPath, ["scripts/set-matchday.mjs", "--file", file], {
    env: { ...process.env, KIND: kind, PAYLOAD: JSON.stringify(payload), SESSION_DATE: date },
    encoding: "utf8",
  });
}

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), "matchday-")), "data", "matchday.json");
}

test("карты в пустой файл: создаются папка, файл и дата, stdout — дата", () => {
  const file = tmpFile();
  const r = run(file, { kind: "maps", payload: { order: ORDER }, date: "2026-10-31" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "2026-10-31");
  const doc = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(doc.sessionDate, "2026-10-31");
  assert.deepEqual(doc.maps.order, ORDER);
  assert.match(doc.maps.savedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("составы без даты не стирают карты и дату", () => {
  const file = tmpFile();
  run(file, { kind: "maps", payload: { order: ORDER }, date: "2026-10-31" });
  const r = run(file, { kind: "teams", payload: TEAMS });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "2026-10-31");
  const doc = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(doc.maps.order, ORDER);
  assert.deepEqual(doc.teams.teamA, TEAMS.teamA);
  assert.equal(doc.sessionDate, "2026-10-31");
});

test("6 карт: код 1, существующий файл не изменён", () => {
  const file = tmpFile();
  run(file, { kind: "maps", payload: { order: ORDER }, date: "2026-10-31" });
  const before = readFileSync(file, "utf8");
  const r = run(file, { kind: "maps", payload: { order: ORDER.slice(0, 6) }, date: "2026-11-01" });
  assert.equal(r.status, 1);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("дата не в формате ISO: код 1, файл не создан", () => {
  const file = tmpFile();
  const r = run(file, { kind: "maps", payload: { order: ORDER }, date: "31.10.2026" });
  assert.equal(r.status, 1);
  assert.equal(existsSync(file), false);
});

test("неизвестный KIND: код 1", () => {
  const r = run(tmpFile(), { kind: "boom", payload: {} });
  assert.equal(r.status, 1);
});

test("PAYLOAD не JSON: код 1", () => {
  const file = tmpFile();
  const r = spawnSync(process.execPath, ["scripts/set-matchday.mjs", "--file", file], {
    env: { ...process.env, KIND: "maps", PAYLOAD: "{не json", SESSION_DATE: "" },
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
});

test("испорченный существующий файл: код 1, файл не перезаписан", () => {
  const file = tmpFile();
  run(file, { kind: "maps", payload: { order: ORDER } });
  writeFileSync(file, "{oops");
  const r = run(file, { kind: "maps", payload: { order: ORDER } });
  assert.equal(r.status, 1);
  assert.equal(readFileSync(file, "utf8"), "{oops");
});
