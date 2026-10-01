import test from "node:test";
import assert from "node:assert/strict";
import { mapDisplayName, summarizeMapFrequency, mapIconUrl } from "../scripts/lib/mapCatalog.mjs";

test("mapDisplayName returns the known competitive name for a recognised map", () => {
  assert.equal(mapDisplayName("de_mirage"), "Mirage");
  assert.equal(mapDisplayName("de_dust2"), "Dust II");
});

test("mapDisplayName falls back to a capitalized, prefix-stripped name for an unknown map", () => {
  assert.equal(mapDisplayName("de_basalt"), "Basalt");
});

test("mapDisplayName capitalizes an unknown name with no recognised prefix as-is", () => {
  assert.equal(mapDisplayName("futuremap"), "Futuremap");
});

test("summarizeMapFrequency counts how many times each map was played", () => {
  const maps = [{ map: "de_mirage" }, { map: "de_dust2" }, { map: "de_mirage" }];
  const result = summarizeMapFrequency(maps);
  const mirage = result.find((m) => m.mapKey === "de_mirage");
  assert.equal(mirage.timesPlayed, 2);
});

test("summarizeMapFrequency orders the most-played map first", () => {
  const maps = [{ map: "de_dust2" }, { map: "de_mirage" }, { map: "de_mirage" }];
  const result = summarizeMapFrequency(maps);
  assert.deepEqual(result.map((m) => m.mapKey), ["de_mirage", "de_dust2"]);
});

test("summarizeMapFrequency breaks a frequency tie alphabetically by display name", () => {
  const maps = [{ map: "de_nuke" }, { map: "de_mirage" }];
  const result = summarizeMapFrequency(maps);
  assert.deepEqual(result.map((m) => m.mapKey), ["de_mirage", "de_nuke"]);
});

test("summarizeMapFrequency includes the display name for each entry", () => {
  const maps = [{ map: "de_inferno" }];
  const result = summarizeMapFrequency(maps);
  assert.equal(result[0].displayName, "Inferno");
});

test("summarizeMapFrequency ignores maps with no map name", () => {
  const maps = [{ map: "de_mirage" }, { map: null }, {}];
  const result = summarizeMapFrequency(maps);
  assert.deepEqual(result.map((m) => m.mapKey), ["de_mirage"]);
});

test("mapIconUrl returns the icon URL for a map with a known icon", () => {
  assert.equal(
    mapIconUrl("de_mirage"),
    "https://raw.githubusercontent.com/vgalisson/csgo-map-icons/master/256x256/map_icon_de_mirage.png"
  );
});

test("mapIconUrl returns null for a map with no icon in the set", () => {
  assert.equal(mapIconUrl("de_boulder"), null);
});

test("mapIconUrl returns null for a missing map name", () => {
  assert.equal(mapIconUrl(null), null);
});
