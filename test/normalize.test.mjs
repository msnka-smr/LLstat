import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLobby } from "../scripts/lib/normalize.mjs";

// Регрессия на реальный случай: cybershoke уронил игрока из
// match_more_stats.stats.teamN.players[], хотя он был в лобби и его K/D
// видны на странице матча (data.players[].match_stats.live). Найдено на
// живом матче 10552874 (см. переписку по этапу 3 в SPEC-процессе).
function buildRawLobby({ dropSteamId }) {
  const team1Players = [{ steamid64: "1", name: "a", kills: 10, deaths: 5 }];
  const team2Players = [
    { steamid64: "2", name: "b", kills: 8, deaths: 6 },
    { steamid64: "3", name: "c", kills: 7, deaths: 9 },
  ].filter((p) => p.steamid64 !== dropSteamId);

  const roster = {
    1: { name: "a", id_slot: 3, match_stats: { live: { kills: 10, deaths: 5 } } },
    2: { name: "b", id_slot: 2, match_stats: { live: { kills: 8, deaths: 6 } } },
    3: { name: "c", id_slot: 2, match_stats: { live: { kills: 7, deaths: 9 } } },
  };

  return {
    data: {
      id_lobby: 999,
      players: roster,
      dates: { unixtime_match_end: 1700000000 },
      match_more_stats: {
        stats: { status: "finished" }, // как в реальном API: дублирует maps["1"] для BO1, но normalizeLobby смотрит только на status здесь
        maps: {
          1: {
            stats: {
              status: "finished",
              map: "de_dust2",
              totalRounds: 16,
              team1: { name: "t1", score: 16, isWinner: true, players: team1Players },
              team2: { name: "t2", score: 10, isWinner: false, players: team2Players },
            },
          },
        },
      },
    },
  };
}

test("a player missing from teamN.players but present in the roster is backfilled from match_stats.live", () => {
  const raw = buildRawLobby({ dropSteamId: "3" });
  const [map] = normalizeLobby(raw);
  assert.equal(map.players.length, 3, "все трое из ростера должны попасть на карту");

  const backfilled = map.players.find((p) => p.steamid64 === "3");
  assert.ok(backfilled, "игрок 3 должен быть добран из match_stats.live");
  assert.equal(backfilled.k, 7);
  assert.equal(backfilled.d, 9);
  assert.equal(backfilled.team, "team2", "команда определяется по id_slot игроков той же группы");
  assert.equal(backfilled.won, false);
});

test("without a drop, all three roster players come straight from teamN.players", () => {
  const raw = buildRawLobby({ dropSteamId: null });
  const [map] = normalizeLobby(raw);
  assert.equal(map.players.length, 3);
});

// Регрессия на реальный случай: на матче 11399948 демо-разбор показал
// Volbe 9 килов и 0 (!) смертей, а страница матча (и match_stats.live)
// показывала 9/12 — демка потеряла все его смерти и, похоже, приписала их
// соседу по команде (у того demo.deaths вышло заметно больше, чем в лобби).
// K/D всегда должен приходить из live, а не из демо-разбора team1/team2.
test("K/D comes from the roster's match_stats.live, not the demo-parsed team1/team2.players", () => {
  const raw = buildRawLobby({ dropSteamId: null });
  raw.data.match_more_stats.maps[1].stats.team1.players[0].kills = 9;
  raw.data.match_more_stats.maps[1].stats.team1.players[0].deaths = 0; // демо ошиблась
  raw.data.players["1"].match_stats.live = { kills: 9, deaths: 12 }; // реальные цифры со страницы матча

  const [map] = normalizeLobby(raw);
  const a = map.players.find((p) => p.steamid64 === "1");
  assert.equal(a.k, 9);
  assert.equal(a.d, 12, "должно быть 12 (из лобби), а не 0 (из демки)");
});

// Регрессия на реальный случай: cybershoke иногда засчитывает ножевой раунд
// (выбор стороны) как настоящий раунд №1, добавляя +1 очко победившей его
// команде. Признак — все килы раунда №1 оружием "Knife". Подтверждено на
// живых матчах против скриншотов из клиента CS2: de_dust2 показывал 13:8
// вместо истинных 13:7, de_inferno — 13:4 вместо 3:13 (после разворота
// команд), и в обоих случаях команда, выигравшая раунд №1 (все килы ножом),
// получала лишнее очко.
function buildLobbyWithPhantomKnifeRound() {
  const knifeRound = {
    winner: "team2",
    events: [
      { weapon: "Knife", killerSteam: "2", victimSteam: "1" },
      { weapon: "Knife", killerSteam: "2", victimSteam: "1" },
      { weapon: "Knife", killerSteam: "1", victimSteam: "2" },
    ],
  };
  const realRound = {
    winner: "team1",
    events: [{ weapon: "AK-47", killerSteam: "1", victimSteam: "2" }],
  };
  return {
    data: {
      id_lobby: 999,
      players: {},
      dates: { unixtime_match_end: 1700000000 },
      match_more_stats: {
        stats: { status: "finished" },
        maps: {
          1: {
            stats: {
              status: "finished",
              map: "de_inferno",
              totalRounds: 17, // включает фантомный раунд — 13 (team1) + 4 (team2)
              rounds: [knifeRound, ...Array(16).fill(realRound)],
              team1: {
                name: "t1",
                score: 13,
                isWinner: true,
                players: [{ steamid64: "1", name: "a", kills: 10, deaths: 5 }],
              },
              team2: {
                name: "t2",
                score: 4, // истинный счёт — 3, +1 за фантомный раунд, который выиграла team2
                isWinner: false,
                players: [{ steamid64: "2", name: "b", kills: 3, deaths: 15 }],
              },
            },
          },
        },
      },
    },
  };
}

test("a knife round miscounted as round 1 is stripped from the score and totalRounds", () => {
  const [map] = normalizeLobby(buildLobbyWithPhantomKnifeRound());
  assert.equal(map.totalRounds, 16, "фантомный раунд убран из totalRounds");
  const team1 = map.teams.find((t) => t.key === "team1");
  const team2 = map.teams.find((t) => t.key === "team2");
  assert.equal(team1.score, 13, "победитель фантомного раунда не выигрывал — его счёт не трогаем");
  assert.equal(team2.score, 3, "команда, выигравшая ножевой раунд, теряет то лишнее очко");

  const a = map.players.find((p) => p.steamid64 === "1");
  const b = map.players.find((p) => p.steamid64 === "2");
  assert.equal(a.k, 10, "килы cybershoke уже сам не считает из ножевого раунда — не трогаем");
  assert.equal(a.d, 3, "raw deaths=5 минус 2 смерти в ножевом раунде (по victimSteam)");
  assert.equal(b.d, 14, "raw deaths=15 минус 1 смерть в ножевом раунде");
});

test("a normal round 1 (not all-knife) leaves the score untouched", () => {
  const raw = buildLobbyWithPhantomKnifeRound();
  raw.data.match_more_stats.maps[1].stats.rounds[0] = { winner: "team1", events: [{ weapon: "AK-47" }] };
  const [map] = normalizeLobby(raw);
  assert.equal(map.totalRounds, 17);
  assert.equal(map.teams.find((t) => t.key === "team2").score, 4);
});
