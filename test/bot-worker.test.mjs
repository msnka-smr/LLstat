import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, MAX_LINKS } from "../bot/src/worker.mjs";

const ENV = {
  WEBHOOK_SECRET: "s3cret",
  ALLOWED_CHAT_ID: "111",
  BOT_TOKEN: "bot-token",
  GITHUB_TOKEN_DISPATCH: "gh-token",
  GITHUB_REPO: "msnka-smr/LLstat",
  WORKFLOW_FILE: "update-stats.yml",
  GITHUB_REF: "master",
};

function req({ method = "POST", secret = "s3cret", body } = {}) {
  const headers = { "content-type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  const init = { method, headers };
  if (method !== "GET") init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://worker.example/", init);
}

// Подменный fetch: записывает вызовы и отвечает по очереди из `replies`.
function fakeFetch(replies = []) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = replies.shift() ?? { status: 200, body: "{}" };
    // статус 204 по спецификации Fetch не может иметь тело
    return new Response(next.status === 204 ? null : (next.body ?? ""), { status: next.status });
  };
  fn.calls = calls;
  return fn;
}

const message = (text, chatId = 111) => ({ message: { chat: { id: chatId }, text } });
const telegramTexts = (f) =>
  f.calls.filter((c) => c.url.includes("api.telegram.org")).map((c) => JSON.parse(c.init.body).text);

test("не POST — 405", async () => {
  const res = await handleRequest(req({ method: "GET" }), ENV, fakeFetch());
  assert.equal(res.status, 405);
});

test("неверный секретный заголовок — 403, ничего не отправляется", async () => {
  const f = fakeFetch();
  const res = await handleRequest(req({ secret: "wrong", body: message("x") }), ENV, f);
  assert.equal(res.status, 403);
  assert.equal(f.calls.length, 0);
});

test("заголовка нет вовсе — 403", async () => {
  const res = await handleRequest(req({ secret: null, body: message("x") }), ENV, fakeFetch());
  assert.equal(res.status, 403);
});

test("тело не JSON — 400", async () => {
  const res = await handleRequest(req({ body: "not json" }), ENV, fakeFetch());
  assert.equal(res.status, 400);
});

test("чужой chat id — 200 и тишина", async () => {
  const f = fakeFetch();
  const res = await handleRequest(
    req({ body: message("https://cybershoke.net/match/12747159", 999) }),
    ENV,
    f
  );
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 0);
});

test("апдейт без message (edited_message, channel_post) — 200 и тишина", async () => {
  const f = fakeFetch();
  for (const body of [
    { edited_message: { chat: { id: 111 }, text: "https://cybershoke.net/match/12747159" } },
    { channel_post: { chat: { id: 111 }, text: "x" } },
    {},
  ]) {
    const res = await handleRequest(req({ body }), ENV, f);
    assert.equal(res.status, 200);
  }
  assert.equal(f.calls.length, 0);
});

test("сообщение без текста (стикер, фото) — 200 и тишина", async () => {
  const f = fakeFetch();
  const res = await handleRequest(req({ body: { message: { chat: { id: 111 }, sticker: {} } } }), ENV, f);
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 0);
});

test("текст без ссылок — подсказка, workflow не запускается", async () => {
  const f = fakeFetch();
  const res = await handleRequest(req({ body: message("привет") }), ENV, f);
  assert.equal(res.status, 200);
  assert.ok(f.calls.every((c) => !c.url.includes("api.github.com")));
  assert.match(telegramTexts(f)[0], /cybershoke\.net\/match/);
});

test("успех: запрос к GitHub с нужным телом и ответ пользователю", async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200 }]);
  const res = await handleRequest(
    req({ body: message("https://cybershoke.net/match/12747159 cybershoke.net/match/12745821") }),
    ENV,
    f
  );
  assert.equal(res.status, 200);

  const gh = f.calls[0];
  assert.equal(
    gh.url,
    "https://api.github.com/repos/msnka-smr/LLstat/actions/workflows/update-stats.yml/dispatches"
  );
  assert.equal(gh.init.method, "POST");
  assert.equal(gh.init.headers.authorization, "Bearer gh-token");
  assert.equal(gh.init.headers["user-agent"], "cs2-stata-bot");
  assert.deepEqual(JSON.parse(gh.init.body), {
    ref: "master",
    inputs: {
      links: "https://cybershoke.net/match/12747159 https://cybershoke.net/match/12745821",
    },
  });

  assert.match(telegramTexts(f)[0], /Принял 2 матча/);
  assert.ok(f.calls[1].url.endsWith("/botbot-token/sendMessage"));
  assert.equal(JSON.parse(f.calls[1].init.body).chat_id, 111);
});

test("ошибка GitHub: пользователь видит код, Telegram получает 200", async () => {
  const f = fakeFetch([{ status: 401, body: '{"message":"Bad credentials"}' }, { status: 200 }]);
  const res = await handleRequest(req({ body: message("https://cybershoke.net/match/12747159") }), ENV, f);
  assert.equal(res.status, 200);
  const text = telegramTexts(f)[0];
  assert.match(text, /401/);
  assert.match(text, /Bad credentials/);
});

test("слишком много ссылок — просьба прислать меньше, workflow не запускается", async () => {
  const links = Array.from({ length: MAX_LINKS + 1 }, (_, i) => `https://cybershoke.net/match/${10000000 + i}`);
  const f = fakeFetch();
  const res = await handleRequest(req({ body: message(links.join(" ")) }), ENV, f);
  assert.equal(res.status, 200);
  assert.ok(f.calls.every((c) => !c.url.includes("api.github.com")));
  assert.match(telegramTexts(f)[0], new RegExp(String(MAX_LINKS)));
});

test("склонение: 1 матч, 2 матча, 5 матчей", async () => {
  for (const [n, word] of [[1, "матч"], [2, "матча"], [5, "матчей"]]) {
    const links = Array.from({ length: n }, (_, i) => `https://cybershoke.net/match/${10000000 + i}`);
    const f = fakeFetch([{ status: 204 }, { status: 200 }]);
    await handleRequest(req({ body: message(links.join(" ")) }), ENV, f);
    assert.match(telegramTexts(f)[0], new RegExp(`Принял ${n} ${word},`));
  }
});
