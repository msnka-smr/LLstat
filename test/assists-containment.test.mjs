import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Решение владельца 2026-10-29: ассисты показываем ТОЛЬКО в списке «Карты вечера»
// (sessions[].maps[].players), в рейтинги и любые другие показатели они не идут.
const stats = JSON.parse(readFileSync("docs/data/stats.json", "utf8"));

function keysDeep(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, found));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) { found.add(k); keysDeep(v, found); }
  }
  return found;
}

test("ассисты есть в sessions[].maps[].players", () => {
  const players = stats.sessions.flatMap((s) => s.maps.flatMap((m) => m.players ?? []));
  assert.ok(players.length > 0);
  assert.ok(players.every((p) => Number.isInteger(p.a) && p.a >= 0));
});

test("ассистов нет ни в allTime, ни в строках сессий, ни в картах, ни в истории рейтинга, ни в рекордах, ни в итогах", () => {
  const rest = {
    allTime: stats.allTime,
    sessionRows: stats.sessions.map((s) => s.players),
    recaps: stats.sessions.map((s) => s.recap),
    ratingHistory: stats.ratingHistory,
    records: stats.records,
    maps: stats.maps,
  };
  const keys = keysDeep(rest);
  assert.equal(keys.has("a"), false);
  assert.equal(keys.has("assists"), false);
});
