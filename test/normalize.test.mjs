import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLobby } from "../scripts/lib/normalize.mjs";

// Регрессия на реальный случай: cybershoke уронил игрока из
// match_more_stats.stats.teamN.players[], хотя он был в лобби и его K/D/A
// видны на странице матча (data.players[].match_stats.live). Найдено на
// живом матче 10552874 (см. переписку по этапу 3 в SPEC-процессе).
function buildRawLobby({ dropSteamId }) {
  const team1Players = [
    { steamid64: "1", name: "a", kills: 10, deaths: 5, assists: 1, roundsPlayed: 16, adr: 80, kast: 70 },
  ];
  const team2Players = [
    { steamid64: "2", name: "b", kills: 8, deaths: 6, assists: 2, roundsPlayed: 16, adr: 75, kast: 65 },
    { steamid64: "3", name: "c", kills: 7, deaths: 9, assists: 3, roundsPlayed: 16, adr: 60, kast: 55 },
  ].filter((p) => p.steamid64 !== dropSteamId);

  const roster = {
    1: { name: "a", id_slot: 3, match_stats: { live: { kills: 10, deaths: 5, assists: 1, headshots: 2 } } },
    2: { name: "b", id_slot: 2, match_stats: { live: { kills: 8, deaths: 6, assists: 2, headshots: 1 } } },
    3: {
      name: "c",
      id_slot: 2,
      match_stats: { live: { kills: 7, deaths: 9, assists: 3, headshots: 3 } },
    },
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
              durationSec: 1000,
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
  assert.equal(backfilled.a, 3);
  assert.equal(backfilled.team, "team2", "команда определяется по id_slot игроков той же группы");
  assert.equal(backfilled.won, false);
  assert.equal(backfilled.rounds, null, "без демо-данных раунды неизвестны — рейтинг по этой карте не считаем");
  assert.equal(backfilled.adr, null);
  assert.equal(backfilled.kast, null);
});

test("without a drop, all three roster players come straight from teamN.players", () => {
  const raw = buildRawLobby({ dropSteamId: null });
  const [map] = normalizeLobby(raw);
  assert.equal(map.players.length, 3);
  assert.ok(map.players.every((p) => p.rounds === 16));
});

// Регрессия на реальную аномалию: у некоторых игроков cybershoke отдаёт
// roundsPlayed кратно больше totalRounds (похоже на баг с реконнектами) —
// из-за этого его собственное поле p.kast может показывать больше 100%.
// Найдено на живых матчах (10552874, 11393084 и другие — kastRounds=34,
// roundsPlayed=42, totalRounds=21 → p.kast=162).
test("rounds comes from stats.totalRounds, not the inflated p.roundsPlayed", () => {
  const raw = {
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
              totalRounds: 21,
              team1: {
                name: "t1",
                score: 13,
                isWinner: true,
                players: [
                  {
                    steamid64: "1",
                    name: "reconnected",
                    kills: 20,
                    deaths: 15,
                    assists: 3,
                    roundsPlayed: 42, // 2x totalRounds — раздутое значение
                    kastRounds: 34, // тоже раздутое тем же множителем
                    kast: 162, // 34/21*100 — то самое кривое значение из raw API
                    adr: 85,
                  },
                ],
              },
              team2: { name: "t2", score: 8, isWinner: false, players: [] },
            },
          },
        },
      },
    },
  };

  const [map] = normalizeLobby(raw);
  const p = map.players[0];
  assert.equal(p.rounds, 21, "должны использоваться totalRounds карты, а не раздутый roundsPlayed");
  assert.ok(Math.abs(p.kast - 80.95) < 0.01, `kast должен быть пересчитан как kastRounds/roundsPlayed*100, получили ${p.kast}`);
  assert.ok(p.kast <= 100, "kast не может быть больше 100%");
});
