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
