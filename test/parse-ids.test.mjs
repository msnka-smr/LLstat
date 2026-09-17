import test from "node:test";
import assert from "node:assert/strict";
import { extractLobbyId } from "../scripts/lib/parse-ids.mjs";

test("plain numeric id", () => {
  assert.equal(extractLobbyId("11836698"), 11836698);
});

test("full url", () => {
  assert.equal(extractLobbyId("https://cybershoke.net/match/11836698"), 11836698);
});

test("url with a locale prefix", () => {
  assert.equal(extractLobbyId("https://cybershoke.net/de/match/11836698"), 11836698);
  assert.equal(extractLobbyId("https://cybershoke.net/ru/match/11836698"), 11836698);
});

test("takes the last 7+ digit run when there are several", () => {
  assert.equal(extractLobbyId("cybershoke.net/de/match/11836698?ref=123456789"), 123456789);
});

test("returns null for text with no long-enough digit run", () => {
  assert.equal(extractLobbyId("not a match link"), null);
  assert.equal(extractLobbyId("12345"), null); // короче 7 цифр
});
