# Telegram-бот для обновления статистики — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бот в личном чате Telegram принимает ссылки на лобби cybershoke, запускает существующий workflow «Обновить статистику» и сообщает о результате.

**Architecture:** Cloudflare Worker принимает webhook от Telegram, проверяет секретный заголовок и Telegram ID владельца, вытаскивает ссылки и запускает `update-stats.yml` через GitHub API (`workflow_dispatch`). Об окончании сборки сообщает последний шаг самого workflow через Telegram Bot API. Логика сбора и сборки не дублируется.

**Tech Stack:** Node ≥ 20 (ESM, `node:test`), Cloudflare Workers (деплой через `npx wrangler`, без новых зависимостей), GitHub REST API, Telegram Bot API.

**Spec:** `specs/2026-10-19-telegram-bot-design.md`

## Global Constraints

- Репозиторий `msnka-smr/LLstat`, ветка `master`, workflow-файл `update-stats.yml`.
- Код воркера в `bot/src/*.mjs`, без внешних зависимостей; тесты в `test/*.test.mjs` (запуск `npm test` из корня).
- Секреты воркера (`BOT_TOKEN`, `WEBHOOK_SECRET`, `GITHUB_TOKEN_DISPATCH`, `ALLOWED_CHAT_ID`) задаются только командой `wrangler secret put` и не попадают в репозиторий; `bot/.dev.vars` в `.gitignore`.
- Секреты репозитория для workflow: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Если не заданы, шаг оповещения пропускается и не роняет workflow.
- Токен GitHub — fine-grained, только репозиторий `LLstat`, право Actions: Read and write.
- Тексты для пользователя — по-русски. Тон спокойный.
- Коммиты в стиле репозитория (русские сообщения), в конце каждого сообщения строка `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Пушит только владелец после просмотра.

## Review Focus

- Сообщение без текста (фото, стикер, пересланное без подписи): воркер не падает, молча отвечает `200`. Тест в задаче 2.
- `edited_message`, `channel_post` и прочие апдейты без `message`: игнорируются с `200`. Тест в задаче 2.
- Ссылки в обрамлении (`<https://...>`, с точкой или запятой в конце, в верхнем регистре, без `https://`, с `www.`): все распознаются. Тест в задаче 1.
- Слишком короткий id (`match/123`): не считается ссылкой. Тест в задаче 1.
- Вставили очень много ссылок (больше 30): бот просит прислать меньше и ничего не запускает. Тест в задаче 2.
- GitHub вернул ошибку: Telegram всё равно получает `200` (иначе будет повторять доставку), а пользователь получает текст ошибки. Тест в задаче 2.
- Тело запроса не JSON: `400`, без падения. Тест в задаче 2.

---

### Task 1: Разбор ссылок на матчи

**Files:**
- Create: `bot/src/links.mjs`
- Test: `test/bot-links.test.mjs`

**Interfaces:**
- Consumes: ничего.
- Produces: `extractMatchLinks(text: string | undefined | null): string[]` — канонические `https://cybershoke.net/match/<id>` без дубликатов, в порядке появления; id — минимум 7 цифр (как в `scripts/lib/parse-ids.mjs`).

- [ ] **Step 1: Написать падающие тесты**

Создать `test/bot-links.test.mjs`:

```js
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
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test test/bot-links.test.mjs`
Expected: FAIL, `Cannot find module '../bot/src/links.mjs'`.

- [ ] **Step 3: Минимальная реализация**

Создать `bot/src/links.mjs`:

```js
// Достаёт из текста сообщения ссылки на матчи cybershoke и приводит их к
// каноническому виду. Минимум 7 цифр в id — как в scripts/lib/parse-ids.mjs,
// иначе collect.mjs всё равно не примет такой токен.
const MATCH_URL = /(?:https?:\/\/)?(?:www\.)?cybershoke\.net\/match\/(\d{7,})/gi;

export function extractMatchLinks(text) {
  const seen = new Set();
  const links = [];
  for (const m of String(text ?? "").matchAll(MATCH_URL)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    links.push(`https://cybershoke.net/match/${id}`);
  }
  return links;
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --test test/bot-links.test.mjs`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git add bot/src/links.mjs test/bot-links.test.mjs
git commit -m "Бот: разбор ссылок на матчи cybershoke" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Обработчик webhook (Cloudflare Worker)

**Files:**
- Create: `bot/src/worker.mjs`
- Test: `test/bot-worker.test.mjs`

**Interfaces:**
- Consumes: `extractMatchLinks` из `bot/src/links.mjs` (задача 1).
- Produces:
  - `MAX_LINKS = 30` (экспорт).
  - `handleRequest(request: Request, env: object, fetchFn?: typeof fetch): Promise<Response>`.
  - `export default { fetch(request, env) }` — точка входа Cloudflare.
  - Ожидаемые поля `env`: `WEBHOOK_SECRET`, `ALLOWED_CHAT_ID`, `BOT_TOKEN`, `GITHUB_TOKEN_DISPATCH`, `GITHUB_REPO`, `WORKFLOW_FILE`, `GITHUB_REF`.

- [ ] **Step 1: Написать падающие тесты**

Создать `test/bot-worker.test.mjs`:

```js
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
    return new Response(next.body ?? "", { status: next.status });
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
  assert.equal(JSON.parse(f.calls[1].init.body).chat_id, "111");
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
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test test/bot-worker.test.mjs`
Expected: FAIL, `Cannot find module '../bot/src/worker.mjs'`.

- [ ] **Step 3: Минимальная реализация**

Создать `bot/src/worker.mjs`:

```js
// Cloudflare Worker: принимает webhook от Telegram и запускает workflow
// «Обновить статистику» через GitHub API. Бот ничего не считает сам — вся
// логика сбора лежит в scripts/update.mjs.
import { extractMatchLinks } from "./links.mjs";

export const MAX_LINKS = 30;

const HINT =
  "Пришли ссылки на матчи в формате https://cybershoke.net/match/12345678 — можно несколько в одном сообщении.";

// У Cloudflare fetch нельзя безопасно вызывать «отвязанным», поэтому обёртка.
const defaultFetch = (...args) => fetch(...args);

function matchesWord(n) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "матчей";
  if (mod10 === 1) return "матч";
  if (mod10 >= 2 && mod10 <= 4) return "матча";
  return "матчей";
}

async function sendMessage(env, chatId, text, fetchFn) {
  await fetchFn(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

async function dispatchWorkflow(env, links, fetchFn) {
  const res = await fetchFn(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN_DISPATCH}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        // GitHub отклоняет запросы без User-Agent
        "user-agent": "cs2-stata-bot",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ref: env.GITHUB_REF, inputs: { links: links.join(" ") } }),
    }
  );
  if (res.status === 204) return { ok: true };
  const body = (await res.text()).slice(0, 200);
  return { ok: false, status: res.status, body };
}

export async function handleRequest(request, env, fetchFn = defaultFetch) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Дальше всегда 200: иначе Telegram будет повторять доставку.
  const message = update?.message;
  if (!message || String(message.chat?.id) !== String(env.ALLOWED_CHAT_ID)) {
    return new Response("ok");
  }
  const text = message.text ?? message.caption;
  if (typeof text !== "string") return new Response("ok");

  const chatId = message.chat.id;
  const links = extractMatchLinks(text);

  if (links.length === 0) {
    await sendMessage(env, chatId, HINT, fetchFn);
    return new Response("ok");
  }
  if (links.length > MAX_LINKS) {
    await sendMessage(env, chatId, `Слишком много ссылок (${links.length}), максимум ${MAX_LINKS} за раз. Пришли поменьше.`, fetchFn);
    return new Response("ok");
  }

  const result = await dispatchWorkflow(env, links, fetchFn);
  if (result.ok) {
    await sendMessage(env, chatId, `Принял ${links.length} ${matchesWord(links.length)}, обновляю. Напишу, когда закончу.`, fetchFn);
  } else {
    await sendMessage(env, chatId, `Не удалось запустить обновление: GitHub ответил ${result.status}. ${result.body}`, fetchFn);
  }
  return new Response("ok");
}

export default {
  fetch: (request, env) => handleRequest(request, env),
};
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --test test/bot-worker.test.mjs`
Expected: PASS, 12 тестов.

- [ ] **Step 5: Прогнать весь набор тестов**

Run: `npm test`
Expected: все тесты проходят, 0 fail.

- [ ] **Step 6: Коммит**

```bash
git add bot/src/worker.mjs test/bot-worker.test.mjs
git commit -m "Бот: обработчик webhook, запуск workflow через GitHub API" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Конфигурация деплоя и инструкция

**Files:**
- Create: `bot/wrangler.toml`
- Create: `bot/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `bot/src/worker.mjs` (точка входа `main`), переменные `GITHUB_REPO`, `WORKFLOW_FILE`, `GITHUB_REF` из задачи 2.
- Produces: готовая конфигурация для `npx wrangler deploy` и пошаговая инструкция для владельца.

- [ ] **Step 1: Создать `bot/wrangler.toml`**

```toml
name = "cs2-stata-bot"
main = "src/worker.mjs"
compatibility_date = "2026-10-01"

# Не секреты. Секреты (BOT_TOKEN, WEBHOOK_SECRET, GITHUB_TOKEN_DISPATCH,
# ALLOWED_CHAT_ID) задаются командой `npx wrangler secret put <ИМЯ>`.
[vars]
GITHUB_REPO = "msnka-smr/LLstat"
WORKFLOW_FILE = "update-stats.yml"
GITHUB_REF = "master"
```

- [ ] **Step 2: Дописать в `.gitignore`**

Добавить строку (файл сейчас содержит `.env` и `node_modules/`):

```
bot/.dev.vars
bot/.wrangler/
```

- [ ] **Step 3: Создать `bot/README.md`**

````markdown
# Telegram-бот для обновления статистики

Присылаешь боту ссылки на лобби cybershoke — он запускает workflow «Обновить статистику» на GitHub. Когда сборка закончится, workflow сам напишет в Telegram. Дизайн: `specs/2026-10-19-telegram-bot-design.md`.

## Разовая настройка

Токены в чат с Claude не отправлять — вводить только в своём терминале.

1. **Бот.** В Telegram: @BotFather → `/newbot` → сохранить токен.
2. **Свой Telegram ID.** Написать @userinfobot, он ответит числом.
3. **Токен GitHub.** Settings → Developer settings → Personal access tokens → Fine-grained tokens. Repository access: только `LLstat`. Permissions: Actions — Read and write.
4. **Секреты репозитория** (Settings → Secrets and variables → Actions): `TELEGRAM_BOT_TOKEN` (токен из п. 1) и `TELEGRAM_CHAT_ID` (число из п. 2).
5. **Cloudflare.** Бесплатный аккаунт на dash.cloudflare.com, затем из папки `bot/`:
   ```powershell
   npx wrangler login
   ```
6. **Секретная строка для webhook:**
   ```powershell
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   Сохранить результат — это `WEBHOOK_SECRET`.
7. **Секреты воркера** (каждая команда спросит значение; из папки `bot/`):
   ```powershell
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put WEBHOOK_SECRET
   npx wrangler secret put GITHUB_TOKEN_DISPATCH
   npx wrangler secret put ALLOWED_CHAT_ID
   ```
8. **Деплой** (из папки `bot/`):
   ```powershell
   npx wrangler deploy
   ```
   В выводе будет адрес вида `https://cs2-stata-bot.<аккаунт>.workers.dev`.
9. **Webhook.** Подставить свои значения:
   ```powershell
   $env:BOT_TOKEN = "<токен бота>"
   curl.exe -X POST "https://api.telegram.org/bot$($env:BOT_TOKEN)/setWebhook" -d "url=https://cs2-stata-bot.<аккаунт>.workers.dev" -d "secret_token=<WEBHOOK_SECRET>"
   ```
   Ответ должен содержать `"ok":true`.

## Проверка

Написать боту ссылку на матч. Должен ответить «Принял 1 матч, обновляю», а через пару минут — «Готово…» или «Ошибка…» от workflow.

## Если что-то не работает

- Бот молчит: `curl.exe "https://api.telegram.org/bot$($env:BOT_TOKEN)/getWebhookInfo"` — смотреть `last_error_message`.
- «GitHub ответил 401/403/404»: проверить токен GitHub (срок действия, репозиторий, право Actions).
- Логи воркера: `npx wrangler tail` из папки `bot/`.
````

- [ ] **Step 4: Проверить, что воркер импортируется как в Cloudflare**

Run: `node -e "import('./bot/src/worker.mjs').then(m => console.log(typeof m.default.fetch, m.MAX_LINKS))"`
Expected: `function 30`

- [ ] **Step 5: Коммит**

```bash
git add bot/wrangler.toml bot/README.md .gitignore
git commit -m "Бот: конфигурация wrangler и инструкция по настройке" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Оповещение о результате в workflow

**Files:**
- Modify: `.github/workflows/update-stats.yml`

**Interfaces:**
- Consumes: секреты репозитория `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Produces: сообщение в Telegram по окончании workflow: «Готово: добавлено N матчей», «Новых матчей нет» или «Ошибка обновления» со ссылкой на запуск. Без секретов шаг молча пропускается.

- [ ] **Step 1: Запомнить число матчей до обновления**

В `.github/workflows/update-stats.yml` сразу после шага `actions/setup-node@v5` добавить:

```yaml
      - name: Запомнить число матчей до обновления
        run: echo "MATCHES_BEFORE=$(ls data/matches | wc -l)" >> "$GITHUB_ENV"
```

- [ ] **Step 2: Добавить последний шаг оповещения**

В конец файла (после шага «Скачать матчи, пересобрать, закоммитить») добавить:

```yaml

      - name: Сообщить результат в Telegram
        if: always()
        env:
          TG_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TG_CHAT: ${{ secrets.TELEGRAM_CHAT_ID }}
          JOB_STATUS: ${{ job.status }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          if [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT" ]; then
            echo "Секреты Telegram не заданы — пропускаю оповещение"
            exit 0
          fi
          AFTER=$(ls data/matches | wc -l)
          ADDED=$((AFTER - ${MATCHES_BEFORE:-$AFTER}))
          if [ "$JOB_STATUS" = "success" ]; then
            if [ "$ADDED" -gt 0 ]; then
              TEXT="Готово: добавлено матчей: $ADDED. Сайт обновится через минуту-две."
            else
              TEXT="Готово, но новых матчей нет (все ссылки уже были учтены)."
            fi
          else
            TEXT="Ошибка обновления статистики. Лог: $RUN_URL"
          fi
          curl -sS -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TG_CHAT}" \
            --data-urlencode "text=${TEXT}" \
            --data-urlencode "disable_web_page_preview=true" || true
```

- [ ] **Step 3: Проверить синтаксис YAML**

Run: `node -e "const s=require('fs').readFileSync('.github/workflows/update-stats.yml','utf8'); if(!/Сообщить результат в Telegram/.test(s)||!/MATCHES_BEFORE/.test(s)) process.exit(1); console.log('шаги на месте, отступов-табов:', (s.match(/\t/g)||[]).length)"`
Expected: `шаги на месте, отступов-табов: 0`

Если на машине есть `actionlint`, дополнительно: `actionlint .github/workflows/update-stats.yml` — ошибок нет.

- [ ] **Step 4: Прогнать тесты**

Run: `npm test`
Expected: все тесты проходят.

- [ ] **Step 5: Коммит**

```bash
git add .github/workflows/update-stats.yml
git commit -m "Workflow обновления: оповещение о результате в Telegram" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Документация проекта и сквозная проверка

**Files:**
- Modify: `CLAUDE.md` (добавить раздел про бота после раздела «Рейтинг»)
- Modify: `C:\Users\m.zolotukhin\.claude\projects\c--Users-m-zolotukhin-claude-custom-projects\memory\cs2-stata-actions-pages-check.md` (обновить по итогам теста)

**Interfaces:**
- Consumes: всё из задач 1–4 и выполненная владельцем настройка из `bot/README.md`.
- Produces: актуальная документация и закрытый вопрос про деплой Pages.

- [ ] **Step 1: Добавить раздел в `CLAUDE.md`**

Перед заголовком `## Устройство \`docs/index.html\`` вставить:

```markdown
## Telegram-бот обновления статистики

`bot/` — Cloudflare Worker. Владелец присылает боту ссылки на лобби, воркер
(`bot/src/worker.mjs`) проверяет секретный заголовок и Telegram ID и запускает
`.github/workflows/update-stats.yml` через `workflow_dispatch`; ссылки
разбирает `bot/src/links.mjs`. Об итоге сообщает последний шаг самого workflow
(секреты репозитория `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Настройка и
деплой — `bot/README.md`, дизайн — `specs/2026-10-19-telegram-bot-design.md`.
Секреты воркера живут только в Cloudflare (`wrangler secret put`), в репозиторий
не попадают. Изменение формата ввода workflow (`inputs.links`) требует правки
воркера.
```

- [ ] **Step 2: Прогнать тесты и закоммитить**

Run: `npm test`
Expected: все тесты проходят.

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: раздел про Telegram-бота" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Владелец выполняет настройку**

Владелец проходит `bot/README.md` пункты 1–9 в своём терминале и просит запушить коммиты (`git push`). Без пуша новый шаг оповещения в workflow не появится на GitHub.

- [ ] **Step 4: Сквозная проверка**

Владелец присылает боту ссылку на матч, которого ещё нет в `data/matches`. Проверить по порядку:
1. Бот ответил «Принял 1 матч, обновляю».
2. В GitHub Actions появился запуск «Обновить статистику» (событие `workflow_dispatch`).
3. После запуска пришло «Готово: добавлено матчей: 1».
4. Бот-коммит появился в репозитории: `git pull` и `git log --oneline -3`.
5. **Закрытие открытого риска:** `curl -s "https://api.github.com/repos/msnka-smr/LLstat/actions/runs?per_page=5"` — после коммита бота должен появиться запуск `pages build and deployment`.
6. Сайт показывает новый матч.

Дополнительно: повторно прислать ту же ссылку — должно прийти «Готово, но новых матчей нет».

- [ ] **Step 5: Если шаг 4.5 не прошёл (деплой Pages не запустился)**

Добавить в workflow явный запуск деплоя Pages. Конкретное решение выбирается по тому, как настроен Pages в репозитории (Settings → Pages): для сборки из ветки — вызвать API `POST /repos/msnka-smr/LLstat/pages/builds` из шага workflow с `GITHUB_TOKEN` (нужно право `pages: write` в `permissions`). После правки повторить шаг 4.

- [ ] **Step 6: Обновить память проекта**

Обновить `memory/cs2-stata-actions-pages-check.md` по результату шага 4.5 (запускается ли Pages после коммита бота; что сделано, если нет) и строку в `MEMORY.md`.

- [ ] **Step 7: Коммит правок workflow (если были)**

```bash
git add .github/workflows/update-stats.yml
git commit -m "Workflow обновления: явный запуск деплоя Pages после коммита бота" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
