// Cloudflare Worker: принимает webhook от Telegram и запускает workflow
// «Обновить статистику» через GitHub API. Бот ничего не считает сам — вся
// логика сбора лежит в scripts/update.mjs.
import { extractMatchLinks } from "./links.mjs";
import { parseMatchdayCommand } from "../../scripts/lib/matchday.mjs";

export const MAX_LINKS = 30;

// GitHub держит в очереди concurrency-группы только один ожидающий запуск:
// новый вытесняет ожидающего, и тот молча отменяется. Поэтому при двух уже
// активных запусках (идёт один, второй ждёт) третий не запускаем.
const MAX_ACTIVE_RUNS = 2;
// Запуски старше этого считаем зависшими и не учитываем.
const ACTIVE_RUN_MAX_AGE_MS = 30 * 60 * 1000;

const BUSY =
  "Обновление уже идёт, и в очереди есть ещё одно. Дождись моего сообщения «Готово» и пришли эти ссылки ещё раз — иначе они могут потеряться.";

const BUSY_MATCHDAY =
  "Закрепление MatchDay уже идёт, и в очереди есть ещё одно. Подожди моего сообщения «Готово» и пришли команду ещё раз — иначе она может потеряться.";

const HINT =
  "Пришли ссылки на матчи в формате https://cybershoke.net/match/12345678 — можно несколько в одном сообщении. Команды /maps и /teams закрепляют порядок карт и составы на вкладке MatchDay (проще всего скопировать их с сайта).";

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

function githubHeaders(env) {
  return {
    authorization: `Bearer ${env.GITHUB_TOKEN_DISPATCH}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    // GitHub отклоняет запросы без User-Agent
    "user-agent": "cs2-stata-bot",
    "content-type": "application/json",
  };
}

// true, если запускать ещё один workflow нельзя. Любая неудача при запросе
// списка — «можно»: лучше запустить, чем отказать из-за сбоя проверки.
async function queueIsFull(env, fetchFn, workflowFile) {
  try {
    const res = await fetchFn(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflowFile}/runs?per_page=10`,
      { headers: githubHeaders(env) }
    );
    if (!res.ok) return false;
    const { workflow_runs: runs = [] } = await res.json();
    const now = Date.now();
    const active = runs.filter(
      (r) => r.status !== "completed" && now - Date.parse(r.created_at) < ACTIVE_RUN_MAX_AGE_MS
    );
    return active.length >= MAX_ACTIVE_RUNS;
  } catch {
    return false;
  }
}

async function dispatchWorkflow(env, workflowFile, inputs, fetchFn) {
  const res = await fetchFn(
    `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: githubHeaders(env),
      body: JSON.stringify({ ref: env.GITHUB_REF, inputs }),
    }
  );
  if (res.status === 204) return { ok: true };
  const body = (await res.text()).slice(0, 200);
  return { ok: false, status: res.status, body };
}

// «31.10.2026» из «2026-10-31» для ответа пользователю.
const ruDate = (iso) => iso.split("-").reverse().join(".");

async function handleMatchdayCommand(env, chatId, command, fetchFn) {
  if (command.error) {
    await sendMessage(env, chatId, command.error, fetchFn);
    return;
  }
  const file = env.WORKFLOW_MATCHDAY_FILE;
  if (await queueIsFull(env, fetchFn, file)) {
    await sendMessage(env, chatId, BUSY_MATCHDAY, fetchFn);
    return;
  }
  const inputs = {
    kind: command.kind,
    payload: JSON.stringify(command.payload),
    session_date: command.sessionDate ?? "",
  };
  const result = await dispatchWorkflow(env, file, inputs, fetchFn);
  if (!result.ok) {
    await sendMessage(env, chatId, `Не удалось запустить закрепление: GitHub ответил ${result.status}. ${result.body}`, fetchFn);
    return;
  }
  const what = command.kind === "maps" ? "порядок карт" : "составы";
  const date = command.sessionDate ? `Дата сессии: ${ruDate(command.sessionDate)}.` : "Дату не меняю.";
  await sendMessage(env, chatId, `Принял, закрепляю ${what}. ${date} Напишу, когда закончу.`, fetchFn);
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
  const command = parseMatchdayCommand(text, new Date());
  if (command) {
    await handleMatchdayCommand(env, chatId, command, fetchFn);
    return new Response("ok");
  }

  const links = extractMatchLinks(text);

  if (links.length === 0) {
    await sendMessage(env, chatId, HINT, fetchFn);
    return new Response("ok");
  }
  if (links.length > MAX_LINKS) {
    await sendMessage(env, chatId, `Слишком много ссылок (${links.length}), максимум ${MAX_LINKS} за раз. Пришли поменьше.`, fetchFn);
    return new Response("ok");
  }

  if (await queueIsFull(env, fetchFn, env.WORKFLOW_FILE)) {
    await sendMessage(env, chatId, BUSY, fetchFn);
    return new Response("ok");
  }

  const result = await dispatchWorkflow(env, env.WORKFLOW_FILE, { links: links.join(" ") }, fetchFn);
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
