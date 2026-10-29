// Закрепляет часть MatchDay (карты или составы) в docs/data/matchday.json.
// Запускается из workflow set-matchday.yml; вход — переменные окружения:
//   KIND          maps | teams | reset (reset удаляет файл целиком)
//   PAYLOAD       JSON с данными части (см. scripts/lib/matchday.mjs)
//   SESSION_DATE  YYYY-MM-DD или пусто (пусто — дату не менять)
// Печатает итоговую дату сессии (или «-»). Любая ошибка — код 1, файл не тронут.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyUpdate, validatePayload } from "./lib/matchday.mjs";

const DEFAULT_FILE = "docs/data/matchday.json";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const fileFlag = process.argv.indexOf("--file");
const file = fileFlag !== -1 ? process.argv[fileFlag + 1] : DEFAULT_FILE;

const kind = process.env.KIND ?? "";
const sessionDate = (process.env.SESSION_DATE ?? "").trim() || null;

let payload;
try {
  payload = JSON.parse(process.env.PAYLOAD ?? "");
} catch {
  fail("PAYLOAD не является корректным JSON");
}

const error = validatePayload(kind, payload);
if (error) fail(error);
if (sessionDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
  fail(`SESSION_DATE должна быть в формате YYYY-MM-DD, получено «${sessionDate}»`);
}

if (kind === "reset") {
  if (existsSync(file)) unlinkSync(file);
  console.log("-");
  process.exit(0);
}

let existing = null;
if (existsSync(file)) {
  try {
    existing = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(`Не удалось прочитать ${file}: файл повреждён`);
  }
}

const doc = applyUpdate(existing, kind, payload, sessionDate, new Date().toISOString());
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
console.log(doc.sessionDate ?? "-");
