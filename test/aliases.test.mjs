import test from "node:test";
import assert from "node:assert/strict";
import { applyAliases } from "../scripts/lib/aliases.mjs";

test("remaps an aliased player's steamid64 to the canonical one", () => {
  const maps = [
    { mapId: "1:1", players: [{ steamid64: "999", name: "alt", k: 5 }] },
    { mapId: "1:2", players: [{ steamid64: "111", name: "main", k: 10 }] },
  ];
  const result = applyAliases(maps, { 999: "111" });
  assert.equal(result[0].players[0].steamid64, "111");
  assert.equal(result[0].players[0].name, "alt", "name/nicknames stay as recorded — only identity is merged");
  assert.equal(result[1].players[0].steamid64, "111");
});

test("players with no alias are left untouched", () => {
  const maps = [{ mapId: "1:1", players: [{ steamid64: "111", name: "main" }] }];
  const result = applyAliases(maps, { 999: "111" });
  assert.deepEqual(result, maps);
});

test("an empty alias map is a no-op", () => {
  const maps = [{ mapId: "1:1", players: [{ steamid64: "111", name: "main" }] }];
  assert.deepEqual(applyAliases(maps, {}), maps);
  assert.deepEqual(applyAliases(maps, undefined), maps);
});
