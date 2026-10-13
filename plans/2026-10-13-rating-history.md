# История рейтинга — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить на вкладку «За всё время» блок «Динамика рейтинга»: линейный график рейтинга по сессиям с выбором до 6 игроков для сравнения.

**Architecture:** `build.mjs` пишет в `stats.json` поле `ratingHistory` (рейтинг каждого игрока после каждой сессии, пропуски — ровно). Построение — чистая функция `computeRatingHistory` (`scripts/lib/ratingHistory.mjs`) с юнит-тестами. Страница рисует встроенный SVG ванильным JS без библиотек, цвета — из палитры навыка `dataviz`, проверенной валидатором для тёмной темы.

**Tech Stack:** Node ≥ 20 (ESM, `node --test`), ванильный JS/HTML/CSS/SVG на странице без сборки; проверка в браузере — Playwright (`playwright-core`) + локальный Microsoft Edge.

**Spec:** `specs/2026-10-13-rating-history-design.md`

## Global Constraints

- Язык интерфейса, комментариев и текстов — русский.
- На странице ни библиотек, ни сборки; `docs/index.html` остаётся одним файлом на ванильном JS, график — встроенный SVG.
- Цвета интерфейса — только CSS-переменные сайта; цвета линий — ровно эти 6 слотов тёмной палитры в таком порядке (проверены `validate_palette.js --mode dark --surface "#1b1e26"`, ALL CHECKS PASS): `#3987e5, #d95926, #199e70, #c98500, #d55181, #008300`.
- Максимум 6 игроков на графике. Цвет принадлежит игроку, пока он выбран (первый свободный слот), и не перекрашивается при снятии других.
- Правила dataviz: линия 2px, маркер r=4 с 2px кольцом цвета поверхности (`--bg-panel`), сетка тонкая сплошная, подписи текстом в токенах текста (не цветом серии), легенда (чипы) всегда видна, подсказка и таблица значений есть, данные игроков в DOM — только через `textContent`.
- Изменения формата `stats.json` — только добавление поля `ratingHistory`; остальные поля не меняются.
- `npm test` остаётся зелёным (на момент плана — 65 тестов).
- Коммиты — только по просьбе пользователя (правило CLAUDE.md), `git push` делает пользователь. Шаги «Commit» — готовая команда для пользователя.

## Review Focus

- Игрок пропустил сессию: значение продолжает прежнее, маркера в этой сессии нет; до первой сыгранной сессии линии нет (`null`).
- В `stats.json` нет `ratingHistory` или в нём 0 сессий: блок не показывается, ошибок в консоли нет.
- Данные из одной сессии: рисуются только маркеры по центру, без ошибок деления на ноль.
- Имя игрока с HTML-разметкой (`<img onerror=…>`) не превращается в DOM-элемент ни в чипах, ни в подсказке, ни в таблице.
- Ресайз окна и телефон 375px: график перерисовывается по ширине контейнера, нет горизонтального скролла страницы; седьмой игрок не добавляется (подсказка), снятие всех игроков даёт пустой график с подсказкой.

## Структура файлов

- Create: `scripts/lib/ratingHistory.mjs` — `computeRatingHistory`.
- Create: `test/ratingHistory.test.mjs` — юнит-тесты.
- Modify: `scripts/build.mjs` — собирает данные игроков и пишет `ratingHistory`.
- Modify: `docs/data/stats.json` — генерируется `npm run build`.
- Modify: `docs/index.html` — CSS, контейнер `#historySection`, JS блока, `sessionDate()`.
- Modify: `CLAUDE.md` — описание.

---

### Task 1: `computeRatingHistory`

**Files:**
- Create: `scripts/lib/ratingHistory.mjs`
- Test: `test/ratingHistory.test.mjs`

**Interfaces:**
- Consumes: сессии от старой к новой `[{ id, firstPlayedAt, ... }]` (как отдаёт `assignSessions`); на игрока — `matches` (хронологически, у каждой карты `sessionId`) и `history` (параллельный массив из `computeAllTimeRating`, элемент `{ before, delta, after }`).
- Produces: `computeRatingHistory(sessions, playersData)` → `{ sessions: [{ id, firstPlayedAt }], players: { [steamid64]: Array<number|null> } }`, где `playersData` — `{ [steamid64]: { matches, history } }`. Значение для сессии, где игрок играл, — `Math.round(after)` его последней карты этой сессии; для сессии без игрока — предыдущее значение; до первой сыгранной — `null`.

- [ ] **Step 1: Write the failing test**

Создать `test/ratingHistory.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { computeRatingHistory } from "../scripts/lib/ratingHistory.mjs";

const sessions = [
  { id: "2026-01-10", firstPlayedAt: 100 },
  { id: "2026-01-17", firstPlayedAt: 200 },
  { id: "2026-01-24", firstPlayedAt: 300 },
];

// matches[i].sessionId и history[i].after идут параллельно, как у build.mjs
function player(entries) {
  return {
    matches: entries.map(([sessionId]) => ({ sessionId })),
    history: entries.map(([, after]) => ({ before: 0, delta: 0, after })),
  };
}

test("output sessions keep order and only id/firstPlayedAt", () => {
  const out = computeRatingHistory(sessions, {});
  assert.deepEqual(out.sessions, [
    { id: "2026-01-10", firstPlayedAt: 100 },
    { id: "2026-01-17", firstPlayedAt: 200 },
    { id: "2026-01-24", firstPlayedAt: 300 },
  ]);
  assert.deepEqual(out.players, {});
});

test("a skipped session carries the previous rating forward", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 520], ["2026-01-24", 480]]),
  });
  assert.deepEqual(out.players.A, [520, 520, 480]);
});

test("sessions before the first played one are null", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-24", 530]]),
  });
  assert.deepEqual(out.players.A, [null, null, 530]);
});

test("a player who only played the first session stays flat afterwards", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 510]]),
  });
  assert.deepEqual(out.players.A, [510, 510, 510]);
});

test("the last map of a session decides that session's value", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 505], ["2026-01-10", 512], ["2026-01-17", 520]]),
  });
  assert.deepEqual(out.players.A, [512, 520, 520]);
});

test("ratings are rounded to integers", () => {
  const out = computeRatingHistory(sessions, {
    A: player([["2026-01-10", 512.4], ["2026-01-17", 512.6]]),
  });
  assert.deepEqual(out.players.A, [512, 513, 513]);
});

test("no sessions gives empty arrays", () => {
  const out = computeRatingHistory([], { A: player([]) });
  assert.deepEqual(out, { sessions: [], players: { A: [] } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ratingHistory.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/ratingHistory.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Создать `scripts/lib/ratingHistory.mjs`:

```js
// История рейтинга "за всё время" по сессиям — для графика на вкладке
// "За всё время". Для каждой сессии берём рейтинг игрока после его последней
// карты этого вечера; если он в этот вечер не играл — рейтинг не менялся,
// значение продолжается; до первой сыгранной сессии — null (линии нет).
//
// sessions — от старой к новой (как отдаёт assignSessions).
// playersData[steamid64] = { matches, history }: matches хронологичны и несут
// sessionId, history — параллельный результат computeAllTimeRating.
export function computeRatingHistory(sessions, playersData) {
  const players = {};
  for (const [steamid64, { matches, history }] of Object.entries(playersData)) {
    const afterBySession = new Map();
    matches.forEach((m, i) => {
      // карты идут по времени, поэтому последняя запись сессии перезаписывает ранние
      afterBySession.set(m.sessionId, history[i].after);
    });

    let carried = null;
    players[steamid64] = sessions.map((s) => {
      if (afterBySession.has(s.id)) carried = Math.round(afterBySession.get(s.id));
      return carried;
    });
  }

  return {
    sessions: sessions.map((s) => ({ id: s.id, firstPlayedAt: s.firstPlayedAt })),
    players,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ratingHistory.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/ratingHistory.mjs test/ratingHistory.test.mjs
git commit -m "История рейтинга: функция computeRatingHistory"
```

---

### Task 2: `build.mjs` пишет `ratingHistory`

**Files:**
- Modify: `scripts/build.mjs` (импорт; блок `allTimeRows` строки ~150–155; объект `output`)
- Modify: `docs/data/stats.json` (генерируется)

**Interfaces:**
- Consumes: `computeRatingHistory(sessions, playersData)` из Task 1; в `build.mjs` уже есть `sessions` (старая → новая), в `allTimeRows`-колбэке — `mapsForPlayer` и `history` игрока.
- Produces: `stats.json.ratingHistory = { sessions: [{ id, firstPlayedAt }], players: { [steamid64]: number|null[] } }`.

- [ ] **Step 1: Импорт**

В `scripts/build.mjs` после строки `import { buildSessionsOutput } from "./lib/sessionsOutput.mjs";` добавить:

```js
import { computeRatingHistory } from "./lib/ratingHistory.mjs";
```

- [ ] **Step 2: Собирать данные игроков в блоке allTime**

Заменить блок

```js
  const allTimeRows = [...byPlayerAllTime.entries()].map(([steamid64, mapsForPlayer]) => {
    const { rating, history } = computeAllTimeRating(mapsForPlayer);
    const row = buildRow(steamid64, registry, mapsForPlayer, threshold, Math.round(rating));
    row.ratingDelta = computeRatingDelta(mapsForPlayer, history, lastSession?.id ?? null);
    return row;
  });
```

на

```js
  // История для графика "Динамика рейтинга": тот же replay, что и рейтинг выше.
  const ratingHistoryInput = {};
  const allTimeRows = [...byPlayerAllTime.entries()].map(([steamid64, mapsForPlayer]) => {
    const { rating, history } = computeAllTimeRating(mapsForPlayer);
    ratingHistoryInput[steamid64] = { matches: mapsForPlayer, history };
    const row = buildRow(steamid64, registry, mapsForPlayer, threshold, Math.round(rating));
    row.ratingDelta = computeRatingDelta(mapsForPlayer, history, lastSession?.id ?? null);
    return row;
  });
```

- [ ] **Step 3: Писать поле в output**

В объект `output` после `sessions: sessionsOutput,` добавить строку:

```js
    ratingHistory: computeRatingHistory(sessions, ratingHistoryInput),
```

- [ ] **Step 4: Пересобрать и сверить с рейтингами**

Run:
```bash
npm run build
node -e '
const s=require("./docs/data/stats.json");
const h=s.ratingHistory;
console.log(Object.keys(s).join(","));
console.log("sessions:", h.sessions.map(x=>x.id).join(" "));
console.log("players:", Object.keys(h.players).length, "allTime:", s.allTime.players.length);
let bad=0;
for (const p of s.allTime.players) {
  const arr=h.players[p.steamid64];
  if (!arr || arr.length!==h.sessions.length) { bad++; console.log("len", p.name); continue; }
  if (arr[arr.length-1]!==p.rating) { bad++; console.log("last!=rating", p.name, arr[arr.length-1], p.rating); }
}
console.log("mismatches:", bad);
'
```
Expected: ключи включают `ratingHistory`; число игроков в `ratingHistory.players` равно `allTime.players`; `mismatches: 0` (последнее значение истории у каждого игрока равно его текущему рейтингу «за всё время»).

- [ ] **Step 5: Прогнать все тесты**

Run: `npm test`
Expected: PASS, 72 теста (65 + 7), 0 fail.

- [ ] **Step 6: Commit**

```bash
git add scripts/build.mjs docs/data/stats.json
git commit -m "История рейтинга: ratingHistory в stats.json"
```

---

### Task 3: Страница — график «Динамика рейтинга»

**Files:**
- Modify: `docs/index.html` (CSS в `<style>`; разметка `#historySection` после `#tableWrap`; функция `sessionDate`; новый блок JS; вызов в `render()`)

**Interfaces:**
- Consumes: `state.data.ratingHistory` (Task 2), `state.data.allTime.players` (отсортирован по рейтингу, неквалифицированные в конце), `state.data.sessions[].players[].steamid64` (кто играл в какой сессии), `escapeHtml`, `sessionLabel`.
- Produces: `sessionDate(id)` → «ДД.ММ.ГГГГ» (+ « (№N)» для суффикса); `renderHistorySection()`; `histState`.

- [ ] **Step 1: CSS**

Перед `</style>` добавить:

```css
  .hist-section {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 16px;
    margin-top: 12px;
  }
  .hist-title { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
  .hist-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .hist-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .hist-chip:hover { color: var(--text); }
  .hist-chip.on { color: var(--text); }
  .hist-chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
    flex-shrink: 0;
  }
  .hist-hint { min-height: 16px; margin-bottom: 4px; font-size: 12px; color: var(--text-faint); }
  .hist-chart { position: relative; width: 100%; }
  .hist-chart svg { display: block; width: 100%; touch-action: pan-y; }
  .hist-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-faint);
    font-size: 13px;
  }
  .hist-tip {
    position: absolute;
    z-index: 5;
    pointer-events: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 12px;
    white-space: nowrap;
  }
  .hist-tip-head { color: var(--text-dim); margin-bottom: 4px; }
  .hist-tip-row { display: flex; align-items: center; gap: 8px; padding: 1px 0; }
  .hist-tip-key { width: 14px; height: 2px; flex-shrink: 0; }
  .hist-tip-name { color: var(--text-dim); flex: 1; }
  .hist-tip-val { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
  .hist-table-wrap { margin-top: 10px; font-size: 12px; color: var(--text-dim); }
  .hist-table-wrap summary { cursor: pointer; }
  .hist-table-scroll { overflow-x: auto; margin-top: 8px; }
  .hist-table { border-collapse: collapse; width: 100%; }
  .hist-table th, .hist-table td {
    padding: 4px 8px;
    text-align: right;
    border-bottom: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .hist-table th:first-child, .hist-table td:first-child { text-align: left; }
```

- [ ] **Step 2: Разметка**

После строки `<div id="tableWrap"></div>` добавить:

```html
  <div id="historySection"></div>
```

- [ ] **Step 3: Вынести `sessionDate`**

Заменить функцию `sessionLabel` на пару:

```js
  // id сессии — "ГГГГ-ММ-ДД" или "ГГГГ-ММ-ДД-N" (N-я сессия в тот же день).
  function sessionDate(id) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d+))?$/.exec(id);
    return m ? m[3] + "." + m[2] + "." + m[1] + (m[4] ? " (№" + m[4] + ")" : "") : id;
  }
  function sessionLabel(s) {
    return sessionDate(s.id) + " · " + mapsCount(s.maps.length);
  }
```

(Старый комментарий над `sessionLabel` про формат id удалить — он переехал выше.)

- [ ] **Step 4: Блок JS**

Перед комментарием `// Чисто for fun: колесо` (поиском по `WHEEL_CATEGORIES` найти место выше него) вставить:

```js
  // "Динамика рейтинга": линейный график рейтинга "за всё время" по сессиям,
  // до HIST_MAX игроков для сравнения (вкладка "За всё время", под таблицей).
  // Цвета — 6 слотов тёмной палитры dataviz, проверенные валидатором против
  // фона панели (#1b1e26). Цвет принадлежит игроку, пока он выбран.
  var HIST_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
  var HIST_MAX = 6;
  var HIST_DEFAULT = 3;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var histState = { ready: false, selected: [] }; // selected: [{ id, color }]

  function svgEl(name, attrs, style) {
    var el = document.createElementNS(SVG_NS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (style) el.setAttribute("style", style);
    return el;
  }
  function histShortDate(id) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(id);
    return m ? m[3] + "." + m[2] : id;
  }
  // Ось Y: округлённые границы и шаг, не более ~5 делений.
  function histYScale(values) {
    var lo = Math.min.apply(null, values.concat([500]));
    var hi = Math.max.apply(null, values.concat([500]));
    var span = Math.max(hi - lo, 50);
    var step = [10, 25, 50, 100, 200, 250, 500].filter(function (s) { return span / s <= 5; })[0] || 500;
    return {
      min: Math.max(0, Math.floor((lo - span * 0.08) / step) * step),
      max: Math.ceil((hi + span * 0.08) / step) * step,
      step: step,
    };
  }
  function histPlayers() {
    var h = state.data.ratingHistory;
    return state.data.allTime.players.filter(function (p) { return h.players[p.steamid64]; });
  }
  // В какие сессии игрок реально играл (по списку игроков каждой сессии).
  function histPlayedIn() {
    var played = {};
    (state.data.sessions || []).forEach(function (s) {
      played[s.id] = {};
      s.players.forEach(function (p) { played[s.id][p.steamid64] = true; });
    });
    return played;
  }

  function renderHistorySection() {
    var el = document.getElementById("historySection");
    var h = state.data && state.data.ratingHistory;
    if (state.tab !== "allTime" || !h || !h.sessions.length) { el.style.display = "none"; return; }
    el.style.display = "";
    if (!histState.ready) {
      histState.selected = histPlayers()
        .filter(function (p) { return p.isQualified; })
        .slice(0, HIST_DEFAULT)
        .map(function (p, i) { return { id: p.steamid64, color: HIST_COLORS[i] }; });
      el.innerHTML =
        '<div class="hist-section">' +
          '<div class="hist-title">Динамика рейтинга</div>' +
          '<div class="hist-chips" id="histChips"></div>' +
          '<div class="hist-hint" id="histHint"></div>' +
          '<div class="hist-chart" id="histChart"></div>' +
          '<details class="hist-table-wrap"><summary>Таблица значений</summary>' +
            '<div class="hist-table-scroll" id="histTable"></div></details>' +
        "</div>";
      window.addEventListener("resize", function () {
        if (state.tab === "allTime") drawHistChart();
      });
      histState.ready = true;
    }
    renderHistChips();
    drawHistChart();
  }

  function renderHistChips() {
    var box = document.getElementById("histChips");
    box.textContent = "";
    histPlayers().forEach(function (p) {
      var sel = histState.selected.filter(function (s) { return s.id === p.steamid64; })[0];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hist-chip" + (sel ? " on" : "");
      btn.setAttribute("aria-pressed", sel ? "true" : "false");
      if (sel) btn.style.borderColor = sel.color;
      var dot = document.createElement("span");
      dot.className = "hist-chip-dot";
      if (sel) dot.style.background = sel.color;
      var label = document.createElement("span");
      label.textContent = p.name;
      btn.appendChild(dot);
      btn.appendChild(label);
      btn.addEventListener("click", function () { toggleHistPlayer(p.steamid64); });
      box.appendChild(btn);
    });
  }

  function toggleHistPlayer(id) {
    var hint = document.getElementById("histHint");
    var idx = -1;
    histState.selected.forEach(function (s, i) { if (s.id === id) idx = i; });
    hint.textContent = "";
    if (idx !== -1) {
      histState.selected.splice(idx, 1);
    } else {
      if (histState.selected.length >= HIST_MAX) {
        hint.textContent = "Максимум " + HIST_MAX + " игроков — сначала снимите кого-нибудь.";
        return;
      }
      var used = histState.selected.map(function (s) { return s.color; });
      var color = HIST_COLORS.filter(function (c) { return used.indexOf(c) === -1; })[0];
      histState.selected.push({ id: id, color: color });
    }
    renderHistChips();
    drawHistChart();
  }

  function drawHistChart() {
    var box = document.getElementById("histChart");
    if (!box || state.tab !== "allTime") return;
    var h = state.data.ratingHistory;
    var names = {};
    state.data.allTime.players.forEach(function (p) { names[p.steamid64] = p.name; });
    var sel = histState.selected;
    box.textContent = "";
    drawHistTable(sel, names);
    if (!sel.length) {
      var empty = document.createElement("div");
      empty.className = "hist-empty";
      empty.textContent = "Выберите игроков, чтобы сравнить их рейтинг";
      box.appendChild(empty);
      return;
    }

    var n = h.sessions.length;
    var width = box.clientWidth || 600;
    var height = width < 480 ? 240 : 280;
    var padL = 40, padR = 14, padT = 12, padB = 26, inner = 10;
    var values = [];
    sel.forEach(function (s) {
      h.players[s.id].forEach(function (v) { if (v !== null) values.push(v); });
    });
    var ys = histYScale(values);
    var plotW = width - padL - padR - inner * 2;
    function xAt(i) { return padL + inner + (n === 1 ? plotW / 2 : i * plotW / (n - 1)); }
    function yAt(v) { return padT + (ys.max - v) / (ys.max - ys.min) * (height - padT - padB); }

    var svg = svgEl("svg", { width: width, height: height, viewBox: "0 0 " + width + " " + height, role: "img", tabindex: "0",
      "aria-label": "График рейтинга по сессиям" });

    for (var t = ys.min; t <= ys.max; t += ys.step) {
      svg.appendChild(svgEl("line", { x1: padL, x2: width - padR, y1: yAt(t), y2: yAt(t) }, "stroke: var(--border); stroke-width: 1;"));
      var tl = svgEl("text", { x: padL - 6, y: yAt(t) + 4, "text-anchor": "end" }, "fill: var(--text-faint); font-size: 11px;");
      tl.textContent = String(t);
      svg.appendChild(tl);
    }
    if (500 >= ys.min && 500 <= ys.max) {
      svg.appendChild(svgEl("line", { x1: padL, x2: width - padR, y1: yAt(500), y2: yAt(500) },
        "stroke: var(--text-faint); stroke-width: 1; opacity: 0.7;"));
      var ref = svgEl("text", { x: width - padR, y: yAt(500) - 4, "text-anchor": "end" }, "fill: var(--text-faint); font-size: 11px;");
      ref.textContent = "500 — средний игрок";
      svg.appendChild(ref);
    }

    // подписи оси X: не чаще, чем помещаются, последняя сессия всегда подписана
    var every = Math.max(1, Math.ceil(n * 44 / (width - padL - padR)));
    h.sessions.forEach(function (s, i) {
      if ((n - 1 - i) % every !== 0) return;
      var xl = svgEl("text", { x: xAt(i), y: height - 8, "text-anchor": "middle" }, "fill: var(--text-faint); font-size: 11px;");
      xl.textContent = histShortDate(s.id);
      svg.appendChild(xl);
    });

    var played = histPlayedIn();
    sel.forEach(function (s) {
      var arr = h.players[s.id];
      var d = "";
      arr.forEach(function (v, i) {
        if (v === null) return;
        d += (d ? " L" : "M") + xAt(i).toFixed(1) + " " + yAt(v).toFixed(1);
      });
      if (d.indexOf("L") !== -1) {
        svg.appendChild(svgEl("path", { d: d }, "fill: none; stroke: " + s.color + "; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"));
      }
      arr.forEach(function (v, i) {
        if (v === null || !(played[h.sessions[i].id] && played[h.sessions[i].id][s.id])) return;
        svg.appendChild(svgEl("circle", { cx: xAt(i), cy: yAt(v), r: 4 },
          "fill: " + s.color + "; stroke: var(--bg-panel); stroke-width: 2;"));
      });
    });

    var guide = svgEl("line", { x1: 0, x2: 0, y1: padT, y2: height - padB }, "stroke: var(--text-faint); stroke-width: 1; display: none;");
    svg.appendChild(guide);
    var hit = svgEl("rect", { x: padL, y: 0, width: width - padL - padR, height: height }, "fill: transparent;");
    svg.appendChild(hit);
    box.appendChild(svg);

    var tip = document.createElement("div");
    tip.className = "hist-tip";
    tip.style.display = "none";
    box.appendChild(tip);

    function showAt(i) {
      var rows = sel.map(function (s) {
        return { color: s.color, name: names[s.id] || s.id, value: h.players[s.id][i] };
      }).sort(function (a, b) { return (b.value === null ? -1 : b.value) - (a.value === null ? -1 : a.value); });
      tip.textContent = "";
      var head = document.createElement("div");
      head.className = "hist-tip-head";
      head.textContent = sessionDate(h.sessions[i].id);
      tip.appendChild(head);
      rows.forEach(function (r) {
        var row = document.createElement("div");
        row.className = "hist-tip-row";
        var key = document.createElement("span");
        key.className = "hist-tip-key";
        key.style.background = r.color;
        var nm = document.createElement("span");
        nm.className = "hist-tip-name";
        nm.textContent = r.name;
        var val = document.createElement("span");
        val.className = "hist-tip-val";
        val.textContent = r.value === null ? "—" : String(r.value);
        row.appendChild(key);
        row.appendChild(nm);
        row.appendChild(val);
        tip.appendChild(row);
      });
      guide.setAttribute("x1", xAt(i));
      guide.setAttribute("x2", xAt(i));
      guide.style.display = "";
      tip.style.display = "";
      var left = xAt(i) + 12;
      if (left + tip.offsetWidth > width) left = xAt(i) - 12 - tip.offsetWidth;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = padT + "px";
    }
    function hide() {
      guide.style.display = "none";
      tip.style.display = "none";
    }
    function nearest(clientX) {
      var rect = svg.getBoundingClientRect();
      var x = (clientX - rect.left) * (width / rect.width);
      var best = 0;
      for (var i = 1; i < n; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
      return best;
    }
    var cursor = n - 1;
    hit.addEventListener("pointermove", function (e) { cursor = nearest(e.clientX); showAt(cursor); });
    hit.addEventListener("pointerdown", function (e) { cursor = nearest(e.clientX); showAt(cursor); });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("focus", function () { showAt(cursor); });
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") cursor = Math.max(0, cursor - 1);
      else if (e.key === "ArrowRight") cursor = Math.min(n - 1, cursor + 1);
      else return;
      e.preventDefault();
      showAt(cursor);
    });
  }

  // Таблица значений — тот же набор данных без наведения (доступность).
  function drawHistTable(sel, names) {
    var host = document.getElementById("histTable");
    var h = state.data.ratingHistory;
    host.textContent = "";
    if (!sel.length) return;
    var table = document.createElement("table");
    table.className = "hist-table";
    var headRow = document.createElement("tr");
    var corner = document.createElement("th");
    corner.textContent = "Игрок";
    headRow.appendChild(corner);
    h.sessions.forEach(function (s) {
      var th = document.createElement("th");
      th.textContent = histShortDate(s.id);
      headRow.appendChild(th);
    });
    table.appendChild(headRow);
    sel.forEach(function (s) {
      var tr = document.createElement("tr");
      var nameCell = document.createElement("td");
      nameCell.textContent = names[s.id] || s.id;
      tr.appendChild(nameCell);
      h.players[s.id].forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = v === null ? "—" : String(v);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    host.appendChild(table);
  }

```

- [ ] **Step 5: Подключить блок в `render()`**

В функции `render()` после `renderTable();` добавить вызов, чтобы получилось:

```js
    renderTable();
    renderHistorySection();
    renderFooter();
```

- [ ] **Step 6: Проверка в браузере**

Запустить локальный сервер (`cd docs && python -m http.server 8801` в отдельном терминале) и выполнить скрипт `check-history.mjs` из временной папки с установленным `playwright-core` (не в репозитории):

```js
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "msedge" });
const errors = [];
let failed = 0;
const check = (ok, text) => { if (!ok) failed++; console.log(ok ? "ok  " : "FAIL", text); };

for (const [label, width] of [["desktop", 1280], ["mobile", 375]]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(label + ": " + m.text()); });
  page.on("pageerror", (e) => errors.push(label + " pageerror: " + e.message));
  await page.addInitScript(() => localStorage.setItem("llstat:selectedTab", "allTime"));
  await page.goto("http://localhost:8801/index.html");
  await page.waitForSelector("#histChart svg");

  const sessions = await page.evaluate(() => fetch("data/stats.json").then((r) => r.json()).then((j) => j.ratingHistory.sessions.length));
  check((await page.$$("#histChart svg path")).length === 3, label + ": 3 линии по умолчанию");
  check((await page.$$("#histChips .hist-chip.on")).length === 3, label + ": 3 выбранных чипа");
  const dots = await page.$$eval("#histChart svg circle", (c) => c.length);
  check(dots > 0 && dots <= 3 * sessions, label + ": маркеры только в сыгранных сессиях (" + dots + " <= " + 3 * sessions + ")");
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), label + ": нет горизонтального скролла");

  // выбор до 6, седьмой блокируется
  // чипы перерисовываются после каждого клика — каждый раз ищем свежий
  for (let i = 0; i < 20 && (await page.$$("#histChips .hist-chip.on")).length < 6; i++) {
    await (await page.$("#histChips .hist-chip:not(.on)")).click();
  }
  check((await page.$$("#histChips .hist-chip.on")).length === 6, label + ": выбрано 6");
  await (await page.$("#histChips .hist-chip:not(.on)")).click();
  check((await page.$$("#histChips .hist-chip.on")).length === 6, label + ": седьмой не добавился");
  check((await page.textContent("#histHint")).includes("Максимум 6"), label + ": подсказка про максимум");
  const colors = await page.$$eval("#histChips .hist-chip.on .hist-chip-dot", (d) => d.map((e) => e.style.background));
  check(new Set(colors).size === 6, label + ": 6 разных цветов");

  // подсказка при наведении
  await page.locator("#histChart").scrollIntoViewIfNeeded();
  const b2 = await (await page.$("#histChart svg")).boundingBox();
  await page.mouse.move(b2.x + b2.width * 0.6, b2.y + b2.height / 2);
  const tipVisible = await page.$eval(".hist-tip", (t) => t.style.display !== "none" && t.querySelectorAll(".hist-tip-row").length === 6);
  check(tipVisible, label + ": подсказка с 6 строками");

  // снятие всех
  while ((await page.$$("#histChips .hist-chip.on")).length) await (await page.$("#histChips .hist-chip.on")).click();
  check((await page.$(".hist-empty")) !== null, label + ": пустой график с подсказкой");
  await page.screenshot({ path: `history-${label}.png`, fullPage: false });

  // ресайз: перерисовка по ширине контейнера
  if (label === "desktop") {
    await (await page.$$("#histChips .hist-chip"))[0].click();
    await page.setViewportSize({ width: 500, height: 900 });
    await page.waitForTimeout(200);
    const w = await page.$eval("#histChart svg", (s) => s.getAttribute("width"));
    check(Number(w) < 500, label + ": ресайз перерисовал график (width=" + w + ")");
  }

  // другие вкладки: блока нет
  await page.click('.tab[data-tab="maps"]');
  check(await page.$eval("#historySection", (e) => e.style.display === "none"), label + ": на «Карты» блок скрыт");
  await page.close();
}

// нет ratingHistory / ноль сессий / одна сессия / XSS в имени
async function withStats(mutate, run) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => errors.push("variant pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("variant: " + m.text()); });
  await page.route("**/data/stats.json", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    mutate(json);
    await route.fulfill({ response: res, json });
  });
  await page.addInitScript(() => localStorage.setItem("llstat:selectedTab", "allTime"));
  await page.goto("http://localhost:8801/index.html");
  await page.waitForSelector("tbody tr.player-row");
  await run(page);
  await page.close();
}

await withStats((j) => { delete j.ratingHistory; }, async (page) => {
  check(await page.$eval("#historySection", (e) => e.style.display === "none"), "без ratingHistory блок скрыт");
});
await withStats((j) => { j.ratingHistory.sessions = []; for (const k in j.ratingHistory.players) j.ratingHistory.players[k] = []; }, async (page) => {
  check(await page.$eval("#historySection", (e) => e.style.display === "none"), "с 0 сессий блок скрыт");
});
await withStats((j) => {
  j.ratingHistory.sessions = j.ratingHistory.sessions.slice(-1);
  for (const k in j.ratingHistory.players) j.ratingHistory.players[k] = j.ratingHistory.players[k].slice(-1);
}, async (page) => {
  await page.waitForSelector("#histChart svg");
  check((await page.$$("#histChart svg circle")).length > 0 && (await page.$$("#histChart svg path")).length === 0, "одна сессия: только маркеры, без линий");
});
await withStats((j) => { j.allTime.players[0].name = '<img src=x onerror="window.__xss=1">'; }, async (page) => {
  await page.waitForSelector("#histChart svg");
  await page.mouse.move(700, 600);
  check((await page.$$("#historySection img")).length === 0, "XSS: img в блоке не появился");
  check((await page.evaluate(() => window.__xss)) === undefined, "XSS: обработчик не сработал");
});

console.log(failed ? "FAILED " + failed : "ALL OK", "errors:", errors);
await browser.close();
```

Run: `node check-history.mjs`
Expected: все строки `ok`, итог `ALL OK errors: []`. Затем открыть скриншоты `history-desktop.png` и `history-mobile.png` и глазами проверить: подписи осей не налезают друг на друга, линии различимы по цвету, чипы не вылезают за блок. Остановить сервер (`taskkill //F //IM python.exe` в Git Bash).

Также прогнать регрессию остальных вкладок прежними скриптами или вручную: «Сессии», «Карты», «Выбор составов» открываются без ошибок в консоли.

- [ ] **Step 7: Commit**

```bash
git add docs/index.html
git commit -m "График «Динамика рейтинга» на вкладке «За всё время»"
```

---

### Task 4: Документация (CLAUDE.md)

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: итоговое поведение Tasks 1–3.
- Produces: актуальное описание данных и блока.

- [ ] **Step 1: Обновить CLAUDE.md**

- В схеме «Как это работает»: в описании `docs/data/stats.json` дописать `ratingHistory` (рейтинг каждого игрока после каждой сессии; `scripts/lib/ratingHistory.mjs`).
- В разделе «Устройство `docs/index.html`»: добавить пункт про «Динамику рейтинга» — блок под таблицей «За всё время» (`renderHistorySection`, `drawHistChart`), SVG на ванильном JS, ось X — сессии, пропущенные сессии продолжают прежний рейтинг (маркеры только в сыгранных), до 6 игроков (по умолчанию топ-3 квалифицированных), цвета — 6 слотов тёмной палитры dataviz (`HIST_COLORS`, проверены валидатором против `#1b1e26`; не менять без повторной проверки), подсказка, таблица значений. Решение пользователя от 2026-10-13: по сессиям, а не по картам (иначе график шумит при росте числа карт).
- Число тестов в строке про `npm test`: подставить фактическое из вывода `npm test` (ожидается 72).

- [ ] **Step 2: Финальная проверка**

Run: `npm test`
Expected: PASS, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Документация: ratingHistory и блок «Динамика рейтинга»"
```

---

## Self-Review

**Покрытие спеки:**
- Данные (`ratingHistory`, форма, null/carry-forward, округление, все игроки, чистая функция с тестами) — Tasks 1–2; сверка «последнее значение = текущий рейтинг» — Task 2 Step 4.
- Страница: блок под таблицей только на «За всё время», чипы с топ-3 квалифицированных, лимит 6 с подсказкой, SVG без библиотек, ось X по сессиям, линия на уровне 500, маркеры только в сыгранных, подсказка (мышь/тап/клавиатура), телефон без горизонтального скролла, палитра dataviz, выбор в памяти — Task 3.
- Крайние случаи (одна сессия, одна сыгранная сессия, ноль выбранных, нет `ratingHistory`) — Task 1 (тесты) и Task 3 Step 6 (браузер).
- Проверка: юнит-тесты, браузер 1280/375, `npm test`, `npm run build` — покрыто.

**Отклонения от спеки (решения плана):**
- Линия «500 — средний игрок» рисуется сплошной, а не пунктирной: навык dataviz требует сплошные recessive-линии (пунктир зарезервирован под данные).
- Сыгранные сессии для маркеров определяются на странице по `state.data.sessions[].players` (id сессий совпадают), поэтому формат `ratingHistory` остался таким, как в спеке.
- Добавлена таблица значений (`<details>`) — требование доступности навыка dataviz.

**Плейсхолдеры:** нет; число тестов в CLAUDE.md берётся из фактического вывода (ожидается 72).

**Согласованность имён:** `computeRatingHistory`, `ratingHistory.{sessions,players}`, `sessionDate`, `histState`, `HIST_COLORS`/`HIST_MAX`/`HIST_DEFAULT`, `histYScale`, `histPlayers`, `histPlayedIn`, `renderHistorySection`, `renderHistChips`, `toggleHistPlayer`, `drawHistChart`, `drawHistTable`, id `#historySection/#histChips/#histHint/#histChart/#histTable` используются одинаково во всех задачах.

**Review Focus:** все пять пунктов закреплены — пропущенные сессии и `null` (тесты Task 1), нет `ratingHistory`/0 сессий/одна сессия (Task 3 Step 6), XSS через имя игрока (Step 6), ресайз/375px/седьмой игрок/пустой график (Step 6).
