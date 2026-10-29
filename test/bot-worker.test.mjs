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
  WORKFLOW_MATCHDAY_FILE: "set-matchday.yml",
  GITHUB_REF: "master",
};

function req({ method = "POST", secret = "s3cret", body } = {}) {
  const headers = { "content-type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  const init = { method, headers };
  if (method !== "GET") init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://worker.example/", init);
}

// Подменный fetch: записывает вызовы. GET со списком запусков workflow
// отвечает по `runs`, остальные запросы — по очереди из `replies`.
function fakeFetch(replies = [], { runs = [], runsStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/runs?")) {
      return new Response(JSON.stringify({ workflow_runs: runs }), { status: runsStatus });
    }
    const next = replies.shift() ?? { status: 200, body: "{}" };
    // статус 204 по спецификации Fetch не может иметь тело
    return new Response(next.status === 204 ? null : (next.body ?? ""), { status: next.status });
  };
  fn.calls = calls;
  return fn;
}

const run = (status, ageMs = 1000) => ({ status, created_at: new Date(Date.now() - ageMs).toISOString() });
const dispatchCall = (f) => f.calls.find((c) => c.url.endsWith("/dispatches"));

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

  const gh = dispatchCall(f);
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
  const tg = f.calls.find((c) => c.url.includes("api.telegram.org"));
  assert.ok(tg.url.endsWith("/botbot-token/sendMessage"));
  assert.equal(JSON.parse(tg.init.body).chat_id, 111);
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

const LINK_MSG = () => req({ body: message("https://cybershoke.net/match/12747159") });

test("идёт один запуск — новый ставится в очередь (потерь нет)", async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200 }], { runs: [run("in_progress")] });
  await handleRequest(LINK_MSG(), ENV, f);
  assert.ok(dispatchCall(f));
  assert.match(telegramTexts(f)[0], /Принял 1 матч/);
});

test("уже идёт запуск и ещё один ждёт — не запускаем третий, просим подождать", async () => {
  const f = fakeFetch([{ status: 200 }], { runs: [run("in_progress"), run("pending")] });
  const res = await handleRequest(LINK_MSG(), ENV, f);
  assert.equal(res.status, 200);
  assert.equal(dispatchCall(f), undefined);
  assert.match(telegramTexts(f)[0], /Готово/);
});

test("завершённые и очень старые незавершённые запуски не считаются активными", async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200 }], {
    runs: [run("completed"), run("in_progress", 2 * 60 * 60 * 1000), run("pending", 2 * 60 * 60 * 1000)],
  });
  await handleRequest(LINK_MSG(), ENV, f);
  assert.ok(dispatchCall(f));
});

test("список запусков недоступен — всё равно запускаем", async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200 }], { runsStatus: 500 });
  await handleRequest(LINK_MSG(), ENV, f);
  assert.ok(dispatchCall(f));
});

// --- MatchDay: команды /maps и /teams ---

const future = (days) => {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return { ru: `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`, iso: d.toISOString().slice(0, 10) };
};
const MAPS_LINE = "mirage nuke anubis inferno ancient dust2 cache";
const id = (n) => "7656119800000000" + n;
const TEAMS_LINE = `moloko=${id(1)}, b=${id(2)}, c=${id(3)}, d=${id(4)}, Вася~700 | e=${id(5)}, f=${id(6)}, g=${id(7)}, h=${id(8)}, Петя~900`;
const matchdayCall = (f) => f.calls.find((c) => c.url.endsWith("/set-matchday.yml/dispatches"));
const statsCall = (f) => f.calls.find((c) => c.url.endsWith("/update-stats.yml/dispatches"));

test("/maps с датой: запускается set-matchday.yml с картами и ISO-датой", async () => {
  const d = future(30);
  const f = fakeFetch([{ status: 204 }, { status: 200 }]);
  const res = await handleRequest(req({ body: message(`/maps ${d.ru} ${MAPS_LINE}`) }), ENV, f);
  assert.equal(res.status, 200);
  const body = JSON.parse(matchdayCall(f).init.body);
  assert.equal(body.ref, "master");
  assert.equal(body.inputs.kind, "maps");
  assert.equal(body.inputs.session_date, d.iso);
  assert.equal(JSON.parse(body.inputs.payload).order.length, 7);
  assert.equal(statsCall(f), undefined);
  assert.match(telegramTexts(f)[0], /карт/);
});

test("/maps без даты — session_date пустая", async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200 }]);
  await handleRequest(req({ body: message(`/maps ${MAPS_LINE}`) }), ENV, f);
  assert.equal(JSON.parse(matchdayCall(f).init.body).inputs.session_date, "");
  assert.match(telegramTexts(f)[0], /Дату не меняю/);
});

test("/teams: запускается set-matchday.yml с двумя командами по 5", async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200 }]);
  await handleRequest(req({ body: message(`/teams ${TEAMS_LINE}`) }), ENV, f);
  const inputs = JSON.parse(matchdayCall(f).init.body).inputs;
  assert.equal(inputs.kind, "teams");
  const payload = JSON.parse(inputs.payload);
  assert.equal(payload.teamA.length, 5);
  assert.equal(payload.teamB.length, 5);
  assert.deepEqual(payload.teamA[4], { guest: "Вася", rating: 700 });
  assert.match(telegramTexts(f)[0], /состав/);
});

test("/maps с 6 картами — workflow не запускается, пользователь получает подсказку", async () => {
  const f = fakeFetch([{ status: 200 }]);
  const res = await handleRequest(req({ body: message("/maps mirage nuke anubis inferno ancient dust2") }), ENV, f);
  assert.equal(res.status, 200);
  assert.equal(dispatchCall(f), undefined);
  assert.match(telegramTexts(f)[0], /7/);
});

test("/maps с датой без года — workflow не запускается, в ответе про год", async () => {
  const f = fakeFetch([{ status: 200 }]);
  await handleRequest(req({ body: message(`/maps 31.10 ${MAPS_LINE}`) }), ENV, f);
  assert.equal(dispatchCall(f), undefined);
  assert.match(telegramTexts(f)[0], /год|ГГГГ/);
});

test("/maps от чужого chat id — тишина", async () => {
  const f = fakeFetch();
  await handleRequest(req({ body: message(`/maps ${MAPS_LINE}`, 999) }), ENV, f);
  assert.equal(f.calls.length, 0);
});

test("два активных запуска set-matchday — не запускаем третий", async () => {
  const f = fakeFetch([{ status: 200 }], { runs: [run("in_progress"), run("pending")] });
  await handleRequest(req({ body: message(`/maps ${MAPS_LINE}`) }), ENV, f);
  assert.equal(dispatchCall(f), undefined);
  assert.match(telegramTexts(f)[0], /MatchDay/);
});

test("ошибка GitHub при /maps: пользователь видит код, Telegram получает 200", async () => {
  const f = fakeFetch([{ status: 422, body: "bad" }, { status: 200 }]);
  const res = await handleRequest(req({ body: message(`/maps ${MAPS_LINE}`) }), ENV, f);
  assert.equal(res.status, 200);
  assert.match(telegramTexts(f)[0], /422/);
});

test("ссылка на матч после появления команд по-прежнему запускает update-stats.yml", async () => {
  const f = fakeFetch([{ status: 204 }, { status: 200 }]);
  await handleRequest(LINK_MSG(), ENV, f);
  assert.ok(statsCall(f));
  assert.equal(matchdayCall(f), undefined);
});
