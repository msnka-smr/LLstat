import test from "node:test";
import assert from "node:assert/strict";
import { parseAvatarFull, refreshSteamAvatars } from "../scripts/lib/steamAvatar.mjs";

const HASH = "7439fbe789b12830670240f4aa2694e39dcddccf";
const xmlWith = (hash) =>
  `<profile><avatarFull><![CDATA[https://avatars.fastly.steamstatic.com/${hash}_full.jpg]]></avatarFull></profile>`;

test("parseAvatarFull normalizes the host so URLs look like the ones cybershoke gives", () => {
  assert.equal(parseAvatarFull(xmlWith(HASH)), `https://avatars.steamstatic.com/${HASH}_full.jpg`);
});

test("parseAvatarFull returns null for private/unknown profiles with no avatar", () => {
  assert.equal(parseAvatarFull("<response><error>not found</error></response>"), null);
  assert.equal(parseAvatarFull("<profile><privacyState>private</privacyState></profile>"), null);
});

test("refreshSteamAvatars stores the current Steam avatar and reports what changed", async () => {
  const registry = { 111: { avatarUrl: "old" }, 222: { avatarUrl: "x" } };
  const fetchText = async (id) => (id === "111" ? xmlWith(HASH) : xmlWith("b".repeat(40)));
  const changed = await refreshSteamAvatars(registry, fetchText);
  assert.equal(registry[111].steamAvatarUrl, `https://avatars.steamstatic.com/${HASH}_full.jpg`);
  assert.equal(registry[111].avatarUrl, "old", "the cybershoke avatar is left alone");
  assert.deepEqual(changed.sort(), ["111", "222"]);
});

test("refreshSteamAvatars reports nothing when the avatar is already up to date", async () => {
  const url = `https://avatars.steamstatic.com/${HASH}_full.jpg`;
  const registry = { 111: { steamAvatarUrl: url } };
  assert.deepEqual(await refreshSteamAvatars(registry, async () => xmlWith(HASH)), []);
});

test("a failed or empty Steam answer keeps the previous avatar", async () => {
  const registry = { 111: { steamAvatarUrl: "kept" }, 222: { avatarUrl: "m" }, 333: { steamAvatarUrl: "kept3" } };
  const fetchText = async (id) => {
    if (id === "111") throw new Error("network down");
    if (id === "222") return "<profile></profile>";
    return null;
  };
  assert.deepEqual(await refreshSteamAvatars(registry, fetchText), []);
  assert.equal(registry[111].steamAvatarUrl, "kept");
  assert.equal(registry[222].steamAvatarUrl, undefined);
  assert.equal(registry[333].steamAvatarUrl, "kept3");
});
