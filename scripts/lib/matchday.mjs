// Разбор и проверка команд /maps и /teams, слияние данных в docs/data/matchday.json.
// Модуль чистый (только строки, Date, Set): его импортируют и воркер бота
// (Cloudflare бандлит его вместе с worker.mjs), и скрипт workflow set-matchday.
export const MAP_POOL = ["de_mirage", "de_dust2", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_cache"];

const TEAM_SIZE = 5;
const GUEST_NAME_MAX = 40;
const GUEST_RATING_MIN = 1;
const GUEST_RATING_MAX = 1500;
const MOSCOW_OFFSET_MS = 3 * 3600 * 1000;

const DATE_HINT = "Дату пиши с годом: ДД.ММ.ГГГГ, например 31.10.2026.";
const MAPS_HINT = "Формат: /maps [ДД.ММ.ГГГГ] и 7 разных карт через пробел, например /maps 31.10.2026 mirage nuke anubis inferno ancient dust2 cache.";
const TEAMS_HINT = "Формат: /teams [ДД.ММ.ГГГГ] пять игроков через запятую | пять игроков через запятую. Игрок — Имя=steamid64, гость — Имя~рейтинг. Проще всего скопировать команду с сайта.";

export function todayMoscow(now) {
  return new Date(now.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
}

export function parseSessionDate(text, now) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(text).trim());
  if (!m) return { ok: false, error: `Не понял дату «${text}». ${DATE_HINT}` };
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return { ok: false, error: `Такой даты нет в календаре: ${text}. ${DATE_HINT}` };
  }
  const iso = check.toISOString().slice(0, 10);
  if (iso < todayMoscow(now)) {
    return { ok: false, error: `Дата ${text} уже прошла. ${DATE_HINT}` };
  }
  return { ok: true, iso };
}

function parseMapKeys(tokens) {
  const order = tokens.map((t) => {
    const key = t.toLowerCase();
    return key.startsWith("de_") ? key : `de_${key}`;
  });
  return order;
}

// Член команды: «Имя=76561198000000000» (игрок) или «Имя~700» (гость).
// Разбор идёт по последнему «=» / «~», имя игрока — только подпись для человека.
function parseMember(token) {
  const t = token.trim();
  const eq = t.lastIndexOf("=");
  const tilde = t.lastIndexOf("~");
  if (eq > tilde) {
    const id = t.slice(eq + 1).trim();
    if (!/^\d{17}$/.test(id)) return { error: `У игрока «${t}» steamid64 должен состоять из 17 цифр.` };
    return { member: { steamid64: id } };
  }
  if (tilde >= 0) {
    const name = t.slice(0, tilde).trim();
    const ratingText = t.slice(tilde + 1).trim();
    if (!name) return { error: `У гостя «${t}» нет имени.` };
    if ([...name].length > GUEST_NAME_MAX) return { error: `Имя гостя «${name}» длиннее ${GUEST_NAME_MAX} символов.` };
    if (!/^\d+$/.test(ratingText)) return { error: `У гостя «${name}» рейтинг должен быть целым числом ${GUEST_RATING_MIN}–${GUEST_RATING_MAX}.` };
    const rating = Number(ratingText);
    if (rating < GUEST_RATING_MIN || rating > GUEST_RATING_MAX) {
      return { error: `У гостя «${name}» рейтинг ${rating} вне диапазона ${GUEST_RATING_MIN}–${GUEST_RATING_MAX}.` };
    }
    return { member: { guest: name, rating } };
  }
  return { error: `Не понял «${t}»: игрок пишется Имя=steamid64, гость — Имя~рейтинг.` };
}

function parseTeamsArgs(argsText) {
  const parts = argsText.split("|");
  if (parts.length !== 2) return { error: `Нужны две команды через « | ». ${TEAMS_HINT}` };
  const teams = [];
  for (const part of parts) {
    const members = [];
    for (const token of part.split(",")) {
      if (!token.trim()) return { error: `В команде пустое место между запятыми. ${TEAMS_HINT}` };
      const r = parseMember(token);
      if (r.error) return { error: `${r.error} ${TEAMS_HINT}` };
      members.push(r.member);
    }
    teams.push(members);
  }
  return { payload: { teamA: teams[0], teamB: teams[1] } };
}

function memberOk(m) {
  if (!m || typeof m !== "object") return false;
  if ("steamid64" in m) return typeof m.steamid64 === "string" && /^\d{17}$/.test(m.steamid64);
  return (
    typeof m.guest === "string" &&
    m.guest.trim().length > 0 &&
    [...m.guest].length <= GUEST_NAME_MAX &&
    Number.isInteger(m.rating) &&
    m.rating >= GUEST_RATING_MIN &&
    m.rating <= GUEST_RATING_MAX
  );
}

export function validatePayload(kind, payload) {
  if (kind === "maps") {
    const order = payload && payload.order;
    if (!Array.isArray(order) || order.length !== MAP_POOL.length) {
      return `Нужно ровно ${MAP_POOL.length} карт. ${MAPS_HINT}`;
    }
    const unknown = order.find((k) => !MAP_POOL.includes(k));
    if (unknown !== undefined) return `Карты «${unknown}» нет в пуле (${MAP_POOL.map((k) => k.slice(3)).join(", ")}). ${MAPS_HINT}`;
    if (new Set(order).size !== order.length) return `Карты не должны повторяться. ${MAPS_HINT}`;
    return null;
  }
  if (kind === "teams") {
    const teams = payload && [payload.teamA, payload.teamB];
    if (!teams || !teams.every((t) => Array.isArray(t) && t.length === TEAM_SIZE)) {
      return `В каждой команде должно быть ровно ${TEAM_SIZE} человек. ${TEAMS_HINT}`;
    }
    const all = teams[0].concat(teams[1]);
    if (!all.every(memberOk)) return `Некорректный игрок в составе. ${TEAMS_HINT}`;
    const ids = all.filter((m) => "steamid64" in m).map((m) => m.steamid64);
    if (new Set(ids).size !== ids.length) return `Один игрок указан в составах дважды. ${TEAMS_HINT}`;
    return null;
  }
  return `Неизвестный вид данных «${kind}».`;
}

const COMMAND = /^\s*\/(maps|teams)(?:@\w+)?(?:\s+([\s\S]*))?$/i;

export function parseMatchdayCommand(text, now) {
  const m = COMMAND.exec(String(text ?? ""));
  if (!m) return null;
  const kind = m[1].toLowerCase();
  let args = (m[2] ?? "").trim();

  let sessionDate = null;
  const first = args.split(/\s+/)[0];
  if (first && /^[\d.]+$/.test(first)) {
    const d = parseSessionDate(first, now);
    if (!d.ok) return { error: d.error };
    sessionDate = d.iso;
    args = args.slice(first.length).trim();
  }

  let payload;
  if (kind === "maps") {
    payload = { order: parseMapKeys(args.split(/\s+/).filter(Boolean)) };
  } else {
    const r = parseTeamsArgs(args);
    if (r.error) return { error: r.error };
    payload = r.payload;
  }
  const error = validatePayload(kind, payload);
  if (error) return { error };
  return { kind, payload, sessionDate };
}

export function applyUpdate(doc, kind, payload, sessionDate, nowIso) {
  const prev = doc ?? {};
  const next = {
    sessionDate: sessionDate ?? prev.sessionDate ?? null,
    ...(prev.maps ? { maps: prev.maps } : {}),
    ...(prev.teams ? { teams: prev.teams } : {}),
  };
  next[kind] = { ...payload, savedAt: nowIso };
  const result = { sessionDate: next.sessionDate };
  if (next.maps) result.maps = next.maps;
  if (next.teams) result.teams = next.teams;
  return JSON.parse(JSON.stringify(result));
}
