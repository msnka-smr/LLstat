import test from "node:test";
import assert from "node:assert/strict";
import { extractMatchLinks } from "../bot/src/links.mjs";

test("одна ссылка", () => {
  assert.deepEqual(extractMatchLinks("https://cybershoke.net/match/12747159"), [
    "https://cybershoke.net/match/12747159",
  ]);
});

test("несколько ссылок в одном сообщении, порядок сохраняется", () => {
  const text = "вот https://cybershoke.net/match/12747159\nи ещё https://cybershoke.net/match/12745821";
  assert.deepEqual(extractMatchLinks(text), [
    "https://cybershoke.net/match/12747159",
    "https://cybershoke.net/match/12745821",
  ]);
});

test("дубликаты по id отбрасываются", () => {
  const text = "https://cybershoke.net/match/12747159 cybershoke.net/match/12747159";
  assert.deepEqual(extractMatchLinks(text), ["https://cybershoke.net/match/12747159"]);
});

test("ссылка без https, с www, в верхнем регистре и в обрамлении", () => {
  assert.deepEqual(extractMatchLinks("cybershoke.net/match/12747159"), ["https://cybershoke.net/match/12747159"]);
  assert.deepEqual(extractMatchLinks("www.cybershoke.net/match/12747159"), ["https://cybershoke.net/match/12747159"]);
  assert.deepEqual(extractMatchLinks("HTTPS://CYBERSHOKE.NET/MATCH/12747159"), ["https://cybershoke.net/match/12747159"]);
  assert.deepEqual(extractMatchLinks("<https://cybershoke.net/match/12747159>."), ["https://cybershoke.net/match/12747159"]);
  assert.deepEqual(extractMatchLinks("(https://cybershoke.net/match/12747159),"), ["https://cybershoke.net/match/12747159"]);
});

test("слишком короткий id не считается ссылкой", () => {
  assert.deepEqual(extractMatchLinks("https://cybershoke.net/match/123"), []);
});

test("чужие домены и текст без ссылок", () => {
  assert.deepEqual(extractMatchLinks("https://example.com/match/12747159"), []);
  assert.deepEqual(extractMatchLinks("привет, как дела"), []);
});

test("пустой и отсутствующий текст", () => {
  assert.deepEqual(extractMatchLinks(""), []);
  assert.deepEqual(extractMatchLinks(undefined), []);
  assert.deepEqual(extractMatchLinks(null), []);
});

test("ссылка с языком в пути (/ru/, /de/, /pt-br/) и поддомен m.", () => {
  assert.deepEqual(extractMatchLinks("https://cybershoke.net/ru/match/11836698"), ["https://cybershoke.net/match/11836698"]);
  assert.deepEqual(extractMatchLinks("https://cybershoke.net/de/match/11836698"), ["https://cybershoke.net/match/11836698"]);
  assert.deepEqual(extractMatchLinks("https://cybershoke.net/pt-br/match/11836698"), ["https://cybershoke.net/match/11836698"]);
  assert.deepEqual(extractMatchLinks("https://m.cybershoke.net/match/11836698"), ["https://cybershoke.net/match/11836698"]);
});
