// Достаёт из текста сообщения ссылки на матчи cybershoke и приводит их к
// каноническому виду. Минимум 7 цифр в id — как в scripts/lib/parse-ids.mjs,
// иначе collect.mjs всё равно не примет такой токен.
// Допускает поддомен (www., m.) и язык в пути (/ru/, /de/, /pt-br/): так выглядят
// ссылки из адресной строки браузера.
const MATCH_URL = /(?:https?:\/\/)?(?:[\w-]+\.)?cybershoke\.net\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?match\/(\d{7,})/gi;

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
