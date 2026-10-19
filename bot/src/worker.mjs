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
