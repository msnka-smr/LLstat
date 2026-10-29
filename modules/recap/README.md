# Модуль «Итоги вечера» (временно убрано с сайта)

Убрано из `docs/index.html` 2026-10-29 по просьбе владельца. Чтобы вернуть —
написать Claude «верни итоги вечера» и сослаться на этот файл.

Что это: кнопка «Итоги вечера» рядом со списком сессий (есть, только если у
сессии есть `recap`), раскрывает карточку-картинку на canvas 1080px (MVP,
топ-3, «Больше всего вырос/просел», карты, «Шутка вечера» из `EXCUSES`) с
кнопками «Скачать PNG», «Копировать», «Другая фраза». Данные `recap` по-прежнему
считает `scripts/lib/recap.mjs` и пишет в `stats.json`, это не удалялось.

**Зависимость:** «Шутка вечера» берётся из массива `EXCUSES` из `modules/excuse`
(«Оправдалка» тоже временно убрана) — возвращать её раньше или вместе с итогами.

## Файлы

- `recap.css` — стили `.recap-btn/.recap-actions/.recap-canvas/.recap-status`.
- `recap.js` — весь JS (`recapState`, `randomExcuse`, `recapModel`, рисование, `renderRecapPanel`).
- `header-handlers.js` — обработчик кнопки в `renderSessionHeader` и вызов `renderRecapPanel(s)`.
- `index.before-removal.html` — полная копия страницы до удаления (эталон).

## Как вернуть (5 точек в docs/index.html)

1. CSS: вставить `recap.css` перед правилом `.session-picker select {`.
2. JS: вставить `recap.js` перед комментарием «Гости (игроки со стороны)…».
3. В `renderSessionHeader` ключ кэша шапки: `var key = state.tab + "|" + s.id + "|" + (recapState.open ? 1 : 0);`.
4. В разметке шапки: после `<select …>` внутри `.session-picker` добавить
   `(s.recap ? '<button type="button" class="recap-btn" id="recapBtn" aria-expanded="' + (recapState.open ? "true" : "false") + '">Итоги вечера</button>' : "") +`,
   а в конец шапки — `+ '<div id="recapPanel"></div>'` (после `session-maps`).
5. После обработчика `change` у `sessionSelect` вставить `header-handlers.js`.

После возврата: `npm test`, проверить вкладку «Сессии» на 1280px и 375px, убрать пометку в CLAUDE.md.
