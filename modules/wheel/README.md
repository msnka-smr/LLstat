# Модуль «Колесо фортуны» (временно убрано с сайта)

Убрано из `docs/index.html` 2026-10-29 по просьбе владельца. Чтобы вернуть —
достаточно написать Claude «верни рулетку» и сослаться на этот файл.

## Что это

Блок на вкладке «Сессии» под таблицей: колесо с секторами по игрокам выбранной
сессии, кнопка «Крутить колесо», случайная категория (6 штук, одна и та же не
выпадает дважды подряд). «Тащер вечера» и «Посмотрю пару стримов…» —
детерминированные (лучший/худший по рейтингу сессии, `players` уже отсортирован),
остальные 4 — честный рандом. Победитель остаётся цветным, остальные серые.
Чистый ванильный JS + CSS (conic-gradient, вращение через transition 5s),
данных из stats.json берёт только `session.players[].name`.

## Файлы модуля

- `wheel.css` — стили `.wheel-section/-category/-stage/-pointer/-dial/-seg-label/-result`.
  Стили `.wheel-spin-btn` НЕ здесь: они остались в index.html, их использует
  «Оправдалка» и «Выбор составов».
- `wheel.js` — весь JS: `WHEEL_CATEGORIES`, `wheelState`, `renderWheelSection`,
  `buildWheel`, `spinWheel`, `setSessionSelectLocked`, `wheelBackground`.
- `index.before-removal.html` — полная копия страницы до удаления (эталон).

## Как вернуть (5 точек в docs/index.html)

1. CSS: вставить содержимое `wheel.css` перед правилом `.wheel-spin-btn { ... }`
   (раньше он шёл сразу перед блоком `.excuse-section`; `.wheel-result` — после
   `.wheel-spin-btn:disabled`, порядок не критичен).
2. HTML: `<div id="wheelSection"></div>` между `recordsSection` и `excuseSection`.
3. JS: вставить содержимое `wheel.js` перед комментарием «Чисто for fun:
   "Оправдалка»…» (перед `var EXCUSES`).
4. В `render()` добавить `renderWheelSection();` после `renderFooter();`.
5. Блокировка смены сессии во время вращения (в `renderSessionHeader`):
   - в ключ `var key = ... + (recapState.open ? 1 : 0)` дописать
     `+ "|" + (wheelState.spinning ? 1 : 0)`;
   - в `<select id="sessionSelect" aria-label="Сессия"` добавить
     `+ (wheelState.spinning ? " disabled" : "")` перед `">"`;
   - в начало обработчика `change` у `sessionSelect`:
     `if (wheelState.spinning) { e.target.value = currentSession().id; return; }`

После возврата: `npm test`, проверить вкладку «Сессии» на 1280px и 375px, в
CLAUDE.md убрать пометку «временно убрано».
