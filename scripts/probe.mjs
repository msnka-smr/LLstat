// Этап 1: разведка боем. Проверяет, отдаёт ли cybershoke.net полную статистику
// матча без авторизации и не блокирует ли запросы Cloudflare.
const LOBBY_ID = 11836698;

const res = await fetch("https://cybershoke.net/api/api/v1/custom-matches/lobbys/info", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id_lobby: LOBBY_ID,
    lobby_password: "",
    players_waiting_all: false,
  }),
});

console.log("status:", res.status);
console.log("content-type:", res.headers.get("content-type"));

const text = await res.text();

if (!res.ok) {
  console.log("body (first 2000 chars):");
  console.log(text.slice(0, 2000));
  process.exit(1);
}

let json;
try {
  json = JSON.parse(text);
} catch (err) {
  console.log("Не удалось распарсить JSON — вероятно, HTML-страница (Cloudflare?).");
  console.log(text.slice(0, 2000));
  process.exit(1);
}

const stats = json?.data?.match_more_stats?.stats;
if (!stats) {
  console.log("Нет match_more_stats.stats в ответе. Полный ответ:");
  console.log(JSON.stringify(json, null, 2).slice(0, 4000));
  process.exit(1);
}

const players = [...(stats.team1?.players ?? []), ...(stats.team2?.players ?? [])];
console.log(`Игроков найдено: ${players.length}`);
for (const p of players) {
  console.log(
    `${p.name}: kills=${p.kills} adr=${p.adr} kast=${p.kast} steamid64=${p.steamid64}`
  );
}
