# Итоги вечера — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На вкладке «Сессии» добавить кнопку «Итоги вечера»: карточка-картинка по выбранной сессии (MVP, топ-3, кто вырос и кто просел, карты, шутка вечера) с кнопками «Скачать PNG», «Копировать», «Другая фраза».

**Architecture:** Чистая функция `scripts/lib/recap.mjs` считает для каждой сессии `recap` (`top`, `rise`, `drop`) и пишется в `stats.json` из `build.mjs` (юнит-тесты). Страница рисует карточку на `<canvas>` ванильным JS без библиотек: двухпроходный расчёт высоты, цвета из CSS-переменных сайта, текстовая версия в `aria-label`.

**Tech Stack:** Node ≥ 20 (ESM, `node --test`), ванильный JS/HTML/CSS/canvas без сборки; проверка в браузере — Playwright (`playwright-core`) + локальный Microsoft Edge.

**Spec:** `specs/2026-10-13-evening-recap-design.md`

## Global Constraints

- Язык интерфейса, комментариев и текстов — русский.
- Страница остаётся одним файлом `docs/index.html`, без библиотек и сборки; картинка рисуется только на canvas.
- Цвета и шрифт карточки — из CSS-переменных сайта (`getComputedStyle`), с запасными значениями.
- Без аватарок Steam (кросс-доменные картинки «пачкают» canvas и ломают `toBlob`).
- Тон мягкий: «Больше всего просел», а не «провалился»; блок падения показывается только если есть кому.
- Размер карточки: ширина 1080px, высота по содержимому; на странице превью до 540px по ширине.
- Данные игроков (имена, карты) рисуются только через `fillText`, в DOM попадают только через `textContent`/атрибуты.
- Изменение `stats.json` — только добавление `sessions[i].recap`; остальные поля не меняются.
- `npm test` остаётся зелёным (на момент плана — 103 теста).
- Коммиты — только по просьбе пользователя (правило CLAUDE.md), `git push` делает пользователь. Шаги «Commit» — готовая команда для пользователя.

## Review Focus

- Сессия с одним игроком: `top` из одного, нет роста и просадки, карточка и страница без ошибок.
- Нет `recap` у сессии или нет `ratingHistory` в данных: кнопки «Итоги вечера» нет (нет `recap`) либо блоки роста и просадки скрыты (нет истории); ошибок нет.
- Пустая сессия (нет игроков) и ничья по рейтингу: `computeRecap` не падает, порядок детерминирован (рейтинг, затем K-D, затем `steamid64`).
- Очень длинное имя и больше 8 карт: имя обрезается «…» по ширине, лишние карты сворачиваются в «и ещё N»; HTML в имени не превращается в DOM.
- Скачанный файл — настоящий PNG шириной 1080 и не пустой; отказ буфера обмена («Копировать») не роняет страницу и даёт понятное сообщение.

## Структура файлов

- Create: `scripts/lib/recap.mjs` — `computeRecap`.
- Create: `test/recap.test.mjs` — юнит-тесты.
- Modify: `scripts/build.mjs` — пишет `sessions[i].recap`.
- Modify: `docs/data/stats.json` — генерируется `npm run build`.
- Modify: `docs/index.html` — CSS, кнопка и панель, модель и отрисовка карточки, кнопки действий.
- Modify: `CLAUDE.md` — описание.

---

### Task 1: `computeRecap`

**Files:**
- Create: `scripts/lib/recap.mjs`
- Test: `test/recap.test.mjs`

**Interfaces:**
- Consumes: `session` в формате вывода `buildSessionOutput` (`{ id, players: [{ steamid64, rating, kd, kdDiff, wins, mapsPlayed, … }], … }`), `ratingHistory` в формате `computeRatingHistory` (`{ sessions: [{ id }], players: { [steamid64]: Array<number|null> } }`) или `undefined`.
- Produces: `computeRecap(session, ratingHistory)` → `{ top: [{ steamid64, rating, kd, kdDiff, wins, maps }], rise: { steamid64, delta } | null, drop: { steamid64, delta } | null }`; константы `TOP_N = 3`, `START_RATING = 500`.

- [ ] **Step 1: Write the failing test**

Создать `test/recap.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { computeRecap, TOP_N, START_RATING } from "../scripts/lib/recap.mjs";

const row = (steamid64, rating, extra = {}) => ({
  steamid64, rating, kd: 1.5, kdDiff: 10, wins: 2, mapsPlayed: 3, isQualified: true, ...extra,
});
const session = (id, players) => ({ id, players });
const history = (ids, players) => ({ sessions: ids.map((id) => ({ id })), players });

test("top lists the best three by session rating, MVP first", () => {
  const s = session("S1", [row("A", 500), row("B", 800), row("C", 650), row("D", 700)]);
  const { top } = computeRecap(s, undefined);
  assert.equal(TOP_N, 3);
  assert.deepEqual(top.map((t) => t.steamid64), ["B", "D", "C"]);
});

test("top entries carry rating, rounded kd, kdDiff, wins and maps", () => {
  const s = session("S1", [row("A", 700, { kd: 1.23456, kdDiff: 7, wins: 4, mapsPlayed: 5 })]);
  assert.deepEqual(computeRecap(s, undefined).top, [
    { steamid64: "A", rating: 700, kd: 1.23, kdDiff: 7, wins: 4, maps: 5 },
  ]);
});

test("equal rating: higher K-D difference first, then steamid64", () => {
  const s = session("S1", [
    row("C", 700, { kdDiff: 5 }),
    row("B", 700, { kdDiff: 9 }),
    row("A", 700, { kdDiff: 5 }),
  ]);
  assert.deepEqual(computeRecap(s, undefined).top.map((t) => t.steamid64), ["B", "A", "C"]);
});

test("an unqualified player can be the MVP", () => {
  const s = session("S1", [row("Q", 600), row("GUEST", 900, { isQualified: false })]);
  assert.equal(computeRecap(s, undefined).top[0].steamid64, "GUEST");
});

test("fewer than three players give a shorter top", () => {
  assert.equal(computeRecap(session("S1", [row("A", 600), row("B", 500)]), undefined).top.length, 2);
});

test("an empty session gives an empty recap", () => {
  assert.deepEqual(computeRecap(session("S1", []), history(["S1"], {})), { top: [], rise: null, drop: null });
});

test("rise and drop come from the change in all-time rating over the session", () => {
  const h = history(["S1", "S2"], { A: [530, 560], B: [510, 490], C: [null, 505], D: [520, 520] });
  const s = session("S2", [row("A", 700), row("B", 650), row("C", 600), row("D", 550)]);
  const { rise, drop } = computeRecap(s, h);
  assert.deepEqual(rise, { steamid64: "A", delta: 30 }); // C: +5 (до — старт 500), A: +30
  assert.deepEqual(drop, { steamid64: "B", delta: -20 });
});

test("the first session measures the change from the starting rating", () => {
  const h = history(["S1", "S2"], { A: [530, 540], B: [510, 510] });
  const { rise, drop } = computeRecap(session("S1", [row("A", 700), row("B", 600)]), h);
  assert.deepEqual(rise, { steamid64: "A", delta: 30 });
  assert.equal(drop, null);
  assert.equal(START_RATING, 500);
});

test("rise is null when nobody grew, drop is null when nobody fell", () => {
  const h = history(["S1", "S2"], { A: [520, 520], B: [510, 500] });
  const { rise, drop } = computeRecap(session("S2", [row("A", 700), row("B", 600)]), h);
  assert.equal(rise, null);
  assert.deepEqual(drop, { steamid64: "B", delta: -10 });
});

test("only players of this session count for rise and drop", () => {
  const h = history(["S1", "S2"], { A: [520, 530], HUGE: [500, 900] });
  const { rise } = computeRecap(session("S2", [row("A", 700)]), h);
  assert.deepEqual(rise, { steamid64: "A", delta: 10 });
});

test("equal deltas are ordered by steamid64", () => {
  const h = history(["S1"], { B: [520], A: [520] });
  const { rise } = computeRecap(session("S1", [row("B", 600), row("A", 600)]), h);
  assert.equal(rise.steamid64, "A");
});

test("no history or an unknown session gives null rise and drop", () => {
  const s = session("S1", [row("A", 600)]);
  assert.deepEqual(computeRecap(s, undefined), { top: computeRecap(s, undefined).top, rise: null, drop: null });
  const other = history(["X"], { A: [999] });
  const out = computeRecap(s, other);
  assert.equal(out.rise, null);
  assert.equal(out.drop, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/recap.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/recap.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Создать `scripts/lib/recap.mjs`:

```js
// "Итоги вечера": данные для карточки выбранной сессии. MVP и топ-3 — по
// рейтингу сессии среди ВСЕХ игроков вечера (квалификация "за всё время" не
// важна: гость или новичок с лучшим вечером тоже может стать MVP). Рост и
// просадка — изменение рейтинга "за всё время" за этот вечер, из ratingHistory.
export const TOP_N = 3;
export const START_RATING = 500; // с него начинается рейтинг "за всё время"

const round2 = (v) => Math.round(v * 100) / 100;
const byId = (a, b) => String(a.steamid64).localeCompare(String(b.steamid64));

// Рейтинг ↓, затем разница K-D ↓, затем steamid64 — детерминированный порядок.
function byRatingDesc(a, b) {
  return (
    (b.rating ?? -Infinity) - (a.rating ?? -Infinity) ||
    (b.kdDiff ?? -Infinity) - (a.kdDiff ?? -Infinity) ||
    byId(a, b)
  );
}

// session — элемент sessions[] из stats.json (players — строки buildRow);
// ratingHistory — результат computeRatingHistory или undefined.
export function computeRecap(session, ratingHistory) {
  const players = session.players ?? [];
  const top = [...players]
    .sort(byRatingDesc)
    .slice(0, TOP_N)
    .map((p) => ({
      steamid64: p.steamid64,
      rating: p.rating,
      kd: p.kd == null ? null : round2(p.kd),
      kdDiff: p.kdDiff,
      wins: p.wins,
      maps: p.mapsPlayed,
    }));

  const idx = ratingHistory ? ratingHistory.sessions.findIndex((s) => s.id === session.id) : -1;
  const deltas = [];
  if (idx !== -1) {
    for (const p of players) {
      const arr = ratingHistory.players[p.steamid64];
      if (!arr || arr[idx] == null) continue;
      // до этого вечера: значение после предыдущей сессии, а для первого вечера игрока — старт
      const before = idx > 0 && arr[idx - 1] != null ? arr[idx - 1] : START_RATING;
      deltas.push({ steamid64: p.steamid64, delta: arr[idx] - before });
    }
  }
  const rise = deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta || byId(a, b))[0] ?? null;
  const drop = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta || byId(a, b))[0] ?? null;

  return { top, rise, drop };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/recap.test.mjs`
Expected: PASS, 11 тестов.

Если упал тест на «первый вечер» или на `rise`/`drop` — это ошибка реализации (проверить логику `before`), не тестов: разобраться в причине, не подгонять ожидания.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/recap.mjs test/recap.test.mjs
git commit -m "Итоги вечера: функция computeRecap"
```

---

### Task 2: `build.mjs` пишет `recap`

**Files:**
- Modify: `scripts/build.mjs` (импорт; блок перед `const output = {`; поле `ratingHistory` в `output`)
- Modify: `docs/data/stats.json` (генерируется)

**Interfaces:**
- Consumes: `computeRecap(session, ratingHistory)` из Task 1; в `build.mjs` есть `sessionsOutput` (элементы вида `buildSessionOutput`, новые → старые) и `computeRatingHistory(sessions, ratingHistoryInput)`.
- Produces: `stats.json.sessions[i].recap = { top, rise, drop }`; `ratingHistory` в `output` по-прежнему тот же объект.

- [ ] **Step 1: Импорт**

После строки `import { computeRecords } from "./lib/records.mjs";` добавить:

```js
import { computeRecap } from "./lib/recap.mjs";
```

- [ ] **Step 2: Посчитать recap до сборки output**

Перед строкой `const output = {` добавить:

```js
  // "Итоги вечера": считаем после sessionsOutput и истории рейтинга, обоим нужен один и тот же набор сессий.
  const ratingHistoryOut = computeRatingHistory(sessions, ratingHistoryInput);
  for (const s of sessionsOutput) s.recap = computeRecap(s, ratingHistoryOut);

```

В объекте `output` заменить строку `ratingHistory: computeRatingHistory(sessions, ratingHistoryInput),` на `ratingHistory: ratingHistoryOut,`.

- [ ] **Step 3: Пересобрать и сверить**

Run:
```bash
npm run build
node -e '
const s=require("./docs/data/stats.json");
console.log(Object.keys(s).join(","));
const names={};for(const p of s.allTime.players)names[p.steamid64]=p.name;
for(const x of s.sessions){
  const r=x.recap;
  console.log(x.id, "| MVP:", names[r.top[0].steamid64], r.top[0].rating, "| топ:", r.top.map(t=>names[t.steamid64]+" "+t.rating).join(", "),
    "| рост:", r.rise?names[r.rise.steamid64]+" +"+r.rise.delta:"—", "| просадка:", r.drop?names[r.drop.steamid64]+" "+r.drop.delta:"—");
}
const bad=s.sessions.filter(x=>!x.recap||x.recap.top.length<1);
console.log("sessions without recap/top:", bad.length);
'
```
Expected: ключи включают `sessions`, `ratingHistory`, `records` как раньше; у каждой из 7 сессий есть `recap`, MVP — игрок с наибольшим рейтингом сессии (совпадает с лучшим в таблице сессии), `sessions without recap/top: 0`. Для самой старой сессии (первый вечер) у всех игроков «рост» считается от 500. Вывод показать пользователю в итоговом сообщении.

- [ ] **Step 4: Прогнать все тесты**

Run: `npm test`
Expected: PASS, 114 тестов (103 + 11), 0 fail.

- [ ] **Step 5: Commit**

```bash
git add scripts/build.mjs docs/data/stats.json
git commit -m "Итоги вечера: recap в сессиях stats.json"
```

### Task 3: Страница — кнопка и карточка «Итоги вечера»

**Files:**
- Modify: `docs/index.html` (CSS; `renderSessionHeader`; блок JS перед комментарием «Гости (игроки со стороны)»)

**Interfaces:**
- Consumes: `currentSession()`, `sessionDate`, `mapsCount`, `recordMapName`, `fmtRating`, `fmtDiff`, `fmt2`, `fmtRatingDelta`, массив `EXCUSES` (все уже есть в файле); `sessions[i].recap` (Task 2); `wheelState` не нужен.
- Produces: `recapState`, `randomExcuse(except)`, `recapModel(session)`, `recapAriaLabel(model)`, `renderRecapCard(ctx, model, colors, draw)`, `drawRecapCard(canvas, session)`, `renderRecapPanel(session)`.

- [ ] **Step 1: CSS**

Заменить строку `.session-picker { margin-bottom: 8px; }` на:

```css
  .session-picker { margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .recap-btn, .recap-actions button {
    background: transparent;
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .recap-btn:hover, .recap-btn[aria-expanded="true"], .recap-actions button:hover {
    color: var(--text);
    border-color: var(--text-dim);
  }
  .recap-canvas {
    display: block;
    width: 100%;
    max-width: 540px;
    height: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    margin: 12px 0 8px;
  }
  .recap-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  .recap-status { font-size: 12px; color: var(--text-faint); }
```

- [ ] **Step 2: Кнопка и панель в `renderSessionHeader`**

В функции `renderSessionHeader()` заменить присваивание `el.innerHTML = …` на (кнопка в строке выбора, панель после заголовка сессии):

```js
    el.innerHTML =
      '<div class="session-picker"><select id="sessionSelect" aria-label="Сессия">' + optionsHtml + "</select>" +
      (s.recap
        ? '<button type="button" class="recap-btn" id="recapBtn" aria-expanded="' + (recapState.open ? "true" : "false") + '">Итоги вечера</button>'
        : "") +
      "</div>" +
      '<div class="session-header"><span class="session-id">Сессия ' + escapeHtml(s.id) + "</span> · " +
      mapsCount(s.maps.length) + (hours ? " · ~" + hours + " ч" : "") +
      '<div class="session-maps">' + mapsHtml + "</div></div>" +
      '<div id="recapPanel"></div>';
```

(Если в текущем коде вместо `mapsCount(s.maps.length)` стоит другое выражение — оставить то, что есть, и только добавить кнопку в `.session-picker` и `<div id="recapPanel"></div>` в конец.)

В конце той же функции, сразу после обработчика `change` у `#sessionSelect`, добавить:

```js
    var recapBtn = document.getElementById("recapBtn");
    if (recapBtn) {
      recapBtn.addEventListener("click", function () {
        recapState.open = !recapState.open;
        if (recapState.open) recapState.joke = randomExcuse();
        renderSessionHeader();
      });
    }
    renderRecapPanel(s);
```

- [ ] **Step 3: Блок JS**

Перед комментарием `// Гости (игроки со стороны): минимум DRAFT_MIN_POOL` вставить:

```js
  // "Итоги вечера": карточка-картинка по выбранной сессии на canvas. Данные
  // (top/rise/drop) считает scripts/lib/recap.mjs; здесь модель, рисование и
  // кнопки. Без аватарок Steam: кросс-доменные картинки "пачкают" canvas и
  // ломают toBlob. Имена рисуются только через fillText.
  var RECAP_W = 1080;
  var RECAP_PAD = 56;
  var RECAP_MAX_MAPS = 8;
  var RECAP_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  var recapState = { open: false, joke: null };

  function randomExcuse(except) {
    var pool = EXCUSES.filter(function (e) { return e !== except; });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function recapModel(s) {
    var byId = {};
    s.players.forEach(function (p) { byId[p.steamid64] = p; });
    function nameOf(id) { return (byId[id] && byId[id].name) || "—"; }
    var r = s.recap;
    var hours = s.lastPlayedAt && s.firstPlayedAt ? Math.max(1, Math.round((s.lastPlayedAt - s.firstPlayedAt) / 3600)) : null;
    var maps = s.maps.map(function (m) {
      var ok = m.teams && m.teams.length === 2 && m.teams[0].score != null && m.teams[1].score != null;
      return {
        name: recordMapName(m.map),
        score: ok ? Math.max(m.teams[0].score, m.teams[1].score) + ":" + Math.min(m.teams[0].score, m.teams[1].score) : "",
      };
    });
    return {
      date: sessionDate(s.id),
      sub: mapsCount(s.maps.length) + (hours ? " · ~" + hours + " ч" : ""),
      top: r.top.map(function (e) {
        return { name: nameOf(e.steamid64), rating: e.rating, kd: e.kd, kdDiff: e.kdDiff, wins: e.wins, maps: e.maps };
      }),
      rise: r.rise ? { name: nameOf(r.rise.steamid64), delta: r.rise.delta } : null,
      drop: r.drop ? { name: nameOf(r.drop.steamid64), delta: r.drop.delta } : null,
      maps: maps.slice(0, RECAP_MAX_MAPS),
      moreMaps: Math.max(0, maps.length - RECAP_MAX_MAPS),
      joke: recapState.joke,
    };
  }

  // Текстовая версия карточки: aria-label canvas и опора для проверок.
  function recapAriaLabel(m) {
    var parts = ["Итоги вечера " + m.date + ". " + m.sub + "."];
    if (m.top.length) {
      parts.push("MVP вечера: " + m.top[0].name + ", рейтинг " + fmtRating(m.top[0].rating) + ".");
      parts.push("Топ-3: " + m.top.map(function (t, i) { return (i + 1) + ". " + t.name + " " + fmtRating(t.rating); }).join("; ") + ".");
    }
    if (m.rise) parts.push("Больше всего вырос: " + m.rise.name + " " + fmtRatingDelta(m.rise.delta) + ".");
    if (m.drop) parts.push("Больше всего просел: " + m.drop.name + " " + fmtRatingDelta(m.drop.delta) + ".");
    if (m.maps.length) {
      parts.push("Карты: " + m.maps.map(function (x) { return x.name + (x.score ? " " + x.score : ""); }).join("; ") +
        (m.moreMaps ? " и ещё " + m.moreMaps : "") + ".");
    }
    if (m.joke) parts.push("Шутка вечера: " + m.joke + ".");
    return parts.join(" ");
  }

  function recapColors() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
    return {
      bg: v("--bg", "#14161c"), panel: v("--bg-panel", "#1b1e26"), border: v("--border", "#2c303b"),
      text: v("--text", "#e6e8ef"), dim: v("--text-dim", "#9096a6"), faint: v("--text-faint", "#5b6172"),
      accent: v("--accent", "#6ea8ff"), green: v("--green", "#3ecf6e"), red: v("--red", "#e0625c"),
    };
  }
  function fitText(ctx, str, maxW) {
    if (ctx.measureText(str).width <= maxW) return str;
    var s = str;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Один код и для замера (draw = false), и для рисования (draw = true):
  // возвращает полную высоту карточки.
  function renderRecapCard(ctx, m, C, draw) {
    var W = RECAP_W, P = RECAP_PAD, inner = W - 2 * P;
    var y = P;
    function text(str, x, baseline, size, weight, color, align, maxW) {
      ctx.font = weight + " " + size + "px " + RECAP_FONT;
      ctx.textAlign = align || "left";
      var s = maxW ? fitText(ctx, String(str), maxW) : String(str);
      if (draw) { ctx.fillStyle = color; ctx.fillText(s, x, baseline); }
    }
    function panel(x, top, w, h) {
      if (!draw) return;
      roundRect(ctx, x, top, w, h, 20);
      ctx.fillStyle = C.panel;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.border;
      ctx.stroke();
    }

    text("Рейтинг игроков «ЛЛ»", P, y + 26, 26, "500", C.faint);
    y += 52;
    text("Итоги вечера", P, y + 56, 64, "700", C.text);
    y += 86;
    text(m.date + " · " + m.sub, P, y + 28, 30, "400", C.dim, "left", inner);
    y += 64;

    if (m.top.length) {
      var mvp = m.top[0];
      panel(P, y, inner, 236);
      text("MVP вечера", P + 36, y + 56, 26, "600", C.accent);
      text(mvp.name, P + 36, y + 128, 64, "700", C.text, "left", inner - 72);
      text("Рейтинг " + fmtRating(mvp.rating) + " · K/D " + fmt2(mvp.kd) + " · K-D " + fmtDiff(mvp.kdDiff) +
        " · побед " + mvp.wins + " из " + mvp.maps, P + 36, y + 188, 30, "400", C.dim, "left", inner - 72);
      y += 236 + 32;

      text("Топ-3 вечера", P, y + 28, 30, "600", C.dim);
      y += 52;
      m.top.forEach(function (t, i) {
        text(String(i + 1), P + 8, y + 40, 38, "700", C.accent);
        text(t.name, P + 64, y + 40, 38, "500", C.text, "left", inner - 64 - 330);
        text(fmtRating(t.rating) + " · K/D " + fmt2(t.kd), W - P, y + 40, 32, "400", C.dim, "right");
        y += 64;
      });
      y += 24;
    }

    var blocks = [];
    if (m.rise) blocks.push({ label: "Больше всего вырос", name: m.rise.name, value: fmtRatingDelta(m.rise.delta), color: C.green });
    if (m.drop) blocks.push({ label: "Больше всего просел", name: m.drop.name, value: fmtRatingDelta(m.drop.delta), color: C.red });
    if (blocks.length) {
      var gap = 24, bw = (inner - gap * (blocks.length - 1)) / blocks.length;
      blocks.forEach(function (b, i) {
        var x = P + i * (bw + gap);
        panel(x, y, bw, 140);
        text(b.label, x + 28, y + 44, 24, "600", C.dim, "left", bw - 56);
        text(b.name, x + 28, y + 104, 38, "700", C.text, "left", bw - 56 - 130);
        text(b.value, x + bw - 28, y + 104, 44, "700", b.color, "right");
      });
      y += 140 + 32;
    }

    if (m.maps.length) {
      text("Карты вечера", P, y + 28, 30, "600", C.dim);
      y += 52;
      m.maps.forEach(function (mp) {
        text(mp.name, P + 8, y + 34, 34, "500", C.text, "left", inner - 200);
        if (mp.score) text(mp.score, W - P, y + 34, 34, "700", C.text, "right");
        y += 52;
      });
      if (m.moreMaps) {
        text("и ещё " + m.moreMaps, P + 8, y + 30, 28, "400", C.faint);
        y += 48;
      }
      y += 16;
    }

    if (m.joke) {
      panel(P, y, inner, 150);
      text("Шутка вечера", P + 36, y + 46, 24, "600", C.dim);
      text("«" + m.joke + "» ✅", P + 36, y + 108, 42, "600", C.text, "left", inner - 72);
      y += 150 + 32;
    }
    return y - 32 + P;
  }

  function drawRecapCard(canvas, s) {
    var ctx = canvas.getContext("2d");
    var C = recapColors();
    var m = recapModel(s);
    canvas.width = RECAP_W;
    var H = renderRecapCard(ctx, m, C, false); // замер
    canvas.height = H; // сбрасывает состояние контекста
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, RECAP_W, H);
    renderRecapCard(ctx, m, C, true);
    canvas.setAttribute("aria-label", recapAriaLabel(m));
  }

  function renderRecapPanel(s) {
    var host = document.getElementById("recapPanel");
    if (!host) return;
    host.textContent = "";
    if (!recapState.open || !s.recap) return;
    if (!recapState.joke) recapState.joke = randomExcuse();

    var canvas = document.createElement("canvas");
    canvas.className = "recap-canvas";
    canvas.setAttribute("role", "img");
    var bar = document.createElement("div");
    bar.className = "recap-actions";
    var status = document.createElement("span");
    status.className = "recap-status";
    status.setAttribute("aria-live", "polite");
    status.id = "recapStatus";
    function button(label, onClick) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", onClick);
      bar.appendChild(b);
    }

    button("Скачать PNG", function () {
      canvas.toBlob(function (blob) {
        if (!blob) { status.textContent = "Не удалось сохранить картинку."; return; }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "itogi-vechera-" + s.id + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        status.textContent = "Файл сохранён.";
      }, "image/png");
    });
    button("Копировать", function () {
      if (!navigator.clipboard || !window.ClipboardItem) {
        status.textContent = "Браузер не умеет копировать картинку — скачайте файл.";
        return;
      }
      canvas.toBlob(function (blob) {
        if (!blob) { status.textContent = "Не удалось скопировать — скачайте файл."; return; }
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(
          function () { status.textContent = "Скопировано."; },
          function () { status.textContent = "Не удалось скопировать — скачайте файл."; }
        );
      }, "image/png");
    });
    button("Другая фраза", function () {
      recapState.joke = randomExcuse(recapState.joke);
      drawRecapCard(canvas, s);
      status.textContent = "";
    });
    bar.appendChild(status);

    host.appendChild(canvas);
    host.appendChild(bar);
    drawRecapCard(canvas, s);
  }

```

- [ ] **Step 4: Проверка в браузере**

Запустить локальный сервер (`cd docs && python -m http.server 8801` в отдельном терминале) и выполнить `check-recap.mjs` из временной папки с установленным `playwright-core` (не в репозитории):

```js
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const browser = await chromium.launch({ channel: "msedge" });
const errors = [];
let failed = 0;
const check = (ok, text) => { if (!ok) failed++; console.log(ok ? "ok  " : "FAIL", text); };

async function open(width, mutate) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 }, acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(width + " pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(width + ": " + m.text()); });
  if (mutate) {
    await page.route("**/data/stats.json", async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      mutate(json);
      await route.fulfill({ response: res, json });
    });
  }
  await page.addInitScript(() => localStorage.setItem("llstat:selectedTab", "lastSession"));
  await page.goto("http://localhost:8801/index.html");
  await page.waitForSelector("#sessionSelect");
  return page;
}
const label = (page) => page.$eval(".recap-canvas", (c) => c.getAttribute("aria-label"));

for (const width of [1280, 375]) {
  const page = await open(width, null);
  check((await page.$("#recapBtn")) !== null, width + ": кнопка «Итоги вечера» есть");
  check((await page.$(".recap-canvas")) === null, width + ": панель закрыта по умолчанию");
  await page.click("#recapBtn");
  await page.waitForSelector(".recap-canvas");
  const aria0 = await label(page);
  check(aria0.includes("MVP вечера:") && aria0.includes("Топ-3:") && aria0.includes("Карты:") && aria0.includes("Шутка вечера:"), width + ": текстовая версия карточки (" + aria0.slice(0, 90) + "…)");
  const dims = await page.$eval(".recap-canvas", (c) => ({ w: c.width, h: c.height }));
  check(dims.w === 1080 && dims.h > 700, width + ": размер картинки " + dims.w + "×" + dims.h);
  const filled = await page.$eval(".recap-canvas", (c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const r0 = d[0], g0 = d[1], b0 = d[2];
    let diff = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] !== r0 || d[i + 1] !== g0 || d[i + 2] !== b0) diff++;
    return diff / (d.length / 4);
  });
  check(filled > 0.03, width + ": картинка не пустая (" + (filled * 100).toFixed(1) + "% не фон)");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), width + ": нет горизонтального скролла");

  // скачивание
  const sessionId = await page.$eval("#sessionSelect", (s) => s.value);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Скачать PNG")]);
  const bytes = readFileSync(await download.path());
  const sig = bytes.subarray(0, 8).toString("hex");
  check(sig === "89504e470d0a1a0a", width + ": файл — настоящий PNG");
  check(bytes.readUInt32BE(16) === 1080, width + ": ширина PNG = 1080");
  check(download.suggestedFilename() === "itogi-vechera-" + sessionId + ".png", width + ": имя файла " + download.suggestedFilename());

  // копирование
  await page.click("text=Копировать");
  await page.waitForFunction(() => document.getElementById("recapStatus").textContent !== "");
  const st = await page.textContent("#recapStatus");
  check(st === "Скопировано." || st.startsWith("Не удалось") || st.startsWith("Браузер не умеет"), width + ": «Копировать» отвечает сообщением (" + st + ")");
  if (st === "Скопировано.") {
    const types = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
    check(types.includes("image/png"), width + ": в буфере image/png");
  }

  // другая фраза
  const before = await label(page);
  await page.click("text=Другая фраза");
  check((await label(page)) !== before, width + ": «Другая фраза» меняет шутку");

  // смена сессии
  const dateBefore = (await label(page)).slice(0, 25);
  await page.selectOption("#sessionSelect", { index: 1 });
  await page.waitForSelector(".recap-canvas");
  check((await label(page)).slice(0, 25) !== dateBefore, width + ": смена сессии перерисовывает карточку");

  // закрыть
  await page.click("#recapBtn");
  check((await page.$(".recap-canvas")) === null, width + ": повторный клик закрывает панель");

  // другие вкладки живы
  for (const t of ["allTime", "maps", "draft", "records"]) {
    await page.click(`.tab[data-tab="${t}"]`);
    check(await page.$eval("#sessionHeader", (e) => e.innerHTML === ""), width + ": на " + t + " шапки сессии и панели нет");
  }
  await page.context().close();
}

// нет recap -> нет кнопки
{
  const page = await open(1280, (j) => { j.sessions.forEach((s) => { delete s.recap; }); });
  check((await page.$("#recapBtn")) === null, "без recap кнопки нет");
  await page.context().close();
}
// нет роста и просадки
{
  const page = await open(1280, (j) => { j.sessions[0].recap.rise = null; j.sessions[0].recap.drop = null; });
  await page.click("#recapBtn");
  await page.waitForSelector(".recap-canvas");
  const a = await label(page);
  check(!a.includes("вырос") && !a.includes("просел"), "без роста/просадки блоков нет");
  await page.context().close();
}
// один игрок, длинное имя, 12 карт, HTML в имени
{
  const page = await open(1280, (j) => {
    const s = j.sessions[0];
    const first = s.players[0];
    s.players = [first];
    first.name = '<img src=x onerror="window.__xss=1">' + "Ы".repeat(80);
    s.recap.top = [s.recap.top[0]];
    s.recap.top[0].steamid64 = first.steamid64;
    s.recap.rise = null; s.recap.drop = null;
    s.maps = Array.from({ length: 12 }, () => JSON.parse(JSON.stringify(s.maps[0])));
  });
  await page.click("#recapBtn");
  await page.waitForSelector(".recap-canvas");
  const a = await label(page);
  check(a.includes("и ещё 4"), "12 карт: «и ещё 4»");
  check((await page.$$("#recapPanel img")).length === 0 && (await page.evaluate(() => window.__xss)) === undefined, "XSS: ничего не исполнилось");
  await page.context().close();
}

console.log(failed ? "FAILED " + failed : "ALL OK", "errors:", errors);
await browser.close();
```

Run: `node check-recap.mjs`
Expected: все строки `ok`, итог `ALL OK errors: []`. Затем снять скриншот открытой панели на 1280 и 375px (`#recapPanel`), сохранить `canvas.toDataURL` одной карточки в PNG и открыть глазами: тексты не налезают друг на друга, имена обрезаются «…», цвета как у сайта, блок падения не красный «в крик». Остановить сервер (`taskkill //F //IM python.exe` в Git Bash). Прогнать прежние проверки других вкладок: «За всё время» с графиком, «Сессии», «Карты», «Выбор составов», «Рекорды» — без ошибок в консоли.

- [ ] **Step 5: Commit**

```bash
git add docs/index.html
git commit -m "Итоги вечера: карточка-картинка на вкладке «Сессии»"
```

---

### Task 4: Документация (CLAUDE.md)

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: итоговое поведение Tasks 1–3.
- Produces: актуальное описание данных и блока.

- [ ] **Step 1: Обновить CLAUDE.md**

- В схеме «Как это работает»: в описании `docs/data/stats.json` добавить, что `sessions[i].recap` (топ-3, рост и просадка рейтинга за вечер) считается в `scripts/lib/recap.mjs`.
- В разделе «Устройство `docs/index.html`»: в описание вкладки «Сессии» добавить «Итоги вечера» (`renderRecapPanel`, `drawRecapCard`, `renderRecapCard`) — кнопка рядом со списком сессий, карточка 1080px на canvas (двухпроходный расчёт высоты), «Скачать PNG» / «Копировать» / «Другая фраза»; без аватарок Steam (кросс-доменные картинки ломают `toBlob`); тон мягкий («просел»); `aria-label` canvas — текстовая версия; блок «Рекорды вечера» сознательно не делали (на большинстве вечеров пуст).
- Число тестов в строке про `npm test`: подставить фактическое из вывода (ожидается 114).

- [ ] **Step 2: Финальная проверка**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Документация: recap и «Итоги вечера»"
```

---

## Self-Review

**Покрытие спеки:**
- Данные: `recap` (`top` до 3, `rise`, `drop`), расчёт по всем игрокам вечера, порядок (рейтинг, K-D, `steamid64`), дельта из `ratingHistory` с «до» = 500 для первого вечера, `null` без истории — Task 1 (тесты) и Task 2.
- Страница: кнопка рядом со списком сессий, только при наличии `recap`; панель с превью (до 540px), «Скачать PNG» (имя `itogi-vechera-<id>.png`), «Копировать» (с запасным сообщением), «Другая фраза»; перерисовка при смене сессии; закрытие повторным кликом; состояние в памяти — Task 3.
- Карточка: 1080px, высота по содержимому, цвета из CSS-переменных, блоки (заголовок, MVP, топ-3, вырос/просел, карты до 8 + «и ещё N», шутка), обрезка длинных имён, без аватарок, `aria-label` — Task 3.
- Крайние случаи (один игрок, нет `recap`/`ratingHistory`, пустая сессия, длинное имя, >8 карт, HTML в имени) — Tasks 1 и 3 Step 4.
- Проверка: юнит-тесты, браузер 1280/375, PNG-сигнатура и ширина, `npm test`, CLAUDE.md — покрыто.

**Отклонения от спеки:** нет.

**Плейсхолдеры:** нет; число тестов (114) подтверждается фактическим выводом.

**Согласованность имён:** `computeRecap`, `TOP_N`, `START_RATING`, `sessions[i].recap = { top, rise, drop }`, `recapState`, `randomExcuse`, `recapModel`, `recapAriaLabel`, `recapColors`, `renderRecapCard`, `drawRecapCard`, `renderRecapPanel`, `#recapBtn`, `#recapPanel`, `.recap-canvas`, `#recapStatus` используются одинаково во всех задачах.

**Review Focus:** все пять пунктов закреплены — один игрок / пустая сессия / ничья (тесты Task 1 и Task 3 Step 4), нет `recap`/`ratingHistory` (Task 3 Step 4), длинное имя / >8 карт / HTML в имени (Task 3 Step 4), настоящий PNG 1080 и отказ буфера обмена (Task 3 Step 4).

---

## Изменения после финального ревью (2026-10-13)

План выше описывает первую версию; после независимого ревью внесено:

- Фокус возвращается на кнопку «Итоги вечера» после перерисовки шапки (иначе с клавиатуры нельзя закрыть панель тем же нажатием).
- «Копировать»: `clipboard.write` вызывается синхронно внутри жеста пользователя, а картинка передаётся в `ClipboardItem` промисом (так работает и в Safari/iOS); синхронные исключения перехватываются и показываются сообщением «Не удалось скопировать — скачайте файл». Каждое действие сначала очищает прошлое сообщение статуса.
- «побед X из Y» в блоке MVP выводится, только если оба значения — числа.
- В тестах убрана тавтология (сравнение `top` с самим собой) и добавлены случаи: рейтинг/K-D null при сортировке, `kd: null` не превращается в NaN, игрок без истории пропускается, ничья у `drop` по `steamid64`. Тестов в `recap.test.mjs`: 12 → 17, всего 120 (в плане было 11 и 114: ошибка подсчёта).
- Сигнатура в спеке исправлена на `computeRecap(session, ratingHistory)`.
- Отложено (мелочи): замер ширины значения дельты (риск при 5+ знаках), знак минуса «−» вместо «-», порядок счёта в шапке сессии (как в данных) и на карточке (победитель первым), перерисовка карточки при каждом `render()`, шрифт карточки зашит в код.
