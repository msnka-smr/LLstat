# Telegram-бот для обновления статистики

Присылаешь боту ссылки на лобби cybershoke — он запускает workflow «Обновить статистику» на GitHub. Когда сборка закончится, workflow сам напишет в Telegram. Дизайн: `specs/2026-10-19-telegram-bot-design.md`.

## Разовая настройка

Токены в чат с Claude не отправлять — вводить только в своём терминале.

1. **Бот.** В Telegram: @BotFather → `/newbot` → сохранить токен.
2. **Свой Telegram ID.** Написать @userinfobot, он ответит числом.
3. **Токен GitHub.** Settings → Developer settings → Personal access tokens → Fine-grained tokens. Repository access: только `LLstat`. Permissions: Actions — Read and write.
4. **Секреты репозитория** (Settings → Secrets and variables → Actions): `TELEGRAM_BOT_TOKEN` (токен из п. 1) и `TELEGRAM_CHAT_ID` (число из п. 2).
5. **Cloudflare.** Бесплатный аккаунт на dash.cloudflare.com, затем из папки `bot/`:
   ```powershell
   npx wrangler login
   ```
6. **Секретная строка для webhook:**
   ```powershell
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   Сохранить результат — это `WEBHOOK_SECRET`.
7. **Секреты воркера** (каждая команда спросит значение; из папки `bot/`):
   ```powershell
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put WEBHOOK_SECRET
   npx wrangler secret put GITHUB_TOKEN_DISPATCH
   npx wrangler secret put ALLOWED_CHAT_ID
   ```
8. **Деплой** (из папки `bot/`):
   ```powershell
   npx wrangler deploy
   ```
   В выводе будет адрес вида `https://cs2-stata-bot.<аккаунт>.workers.dev`.
9. **Webhook.** Подставить свои значения:
   ```powershell
   $env:BOT_TOKEN = "<токен бота>"
   curl.exe -X POST "https://api.telegram.org/bot$($env:BOT_TOKEN)/setWebhook" -d "url=https://cs2-stata-bot.<аккаунт>.workers.dev" -d "secret_token=<WEBHOOK_SECRET>"
   ```
   Ответ должен содержать `"ok":true`.

## Команды MatchDay

Кроме ссылок на матчи, бот понимает две команды для вкладки «MatchDay» на сайте. Руками их набирать не нужно: на вкладке «Выбор составов» есть кнопки «Копировать команду для состава» и «Копировать команду для карт» — копируешь, вставляешь в чат с ботом, при желании дописываешь дату сессии после команды.

- `/maps [ДД.ММ.ГГГГ] mirage nuke anubis inferno ancient dust2 cache` — порядок 7 карт (пул: mirage, dust2, inferno, nuke, ancient, anubis, cache).
- `/teams [ДД.ММ.ГГГГ] Имя=steamid64, ... (5) | ... (5)` — два состава по 5 человек; гость пишется `Имя~рейтинг` (рейтинг 1–1500).

Дату нужно писать с годом, например `31.10.2026`; она одна на весь MatchDay, последняя указанная заменяет прежнюю, без даты прежняя остаётся. Команды запускают workflow `set-matchday.yml` (переменная воркера `WORKFLOW_MATCHDAY_FILE` в `wrangler.toml`), результат придёт сообщением «Готово: … Дата сессии: …». Спека: `specs/2026-10-29-map-order-design.md`.

**После обновления кода воркера его нужно задеплоить** (из папки `bot/`): `npx wrangler deploy`.

## Проверка

Написать боту ссылку на матч. Должен ответить «Принял 1 матч, обновляю», а через пару минут — «Готово…» или «Ошибка…» от workflow.

## Если что-то не работает

- Бот молчит: `curl.exe "https://api.telegram.org/bot$($env:BOT_TOKEN)/getWebhookInfo"` — смотреть `last_error_message`.
- «GitHub ответил 401/403/404»: проверить токен GitHub (срок действия, репозиторий, право Actions).
- Логи воркера: `npx wrangler tail` из папки `bot/`.
