// Вкладка «Дуэли»: личная статистика двух игроков по картам, где они были соперниками.
// Читает sessions[].maps[] из stats.json (matrix убийств из разбора демки), в агрегаты
// и рейтинги ничего не пишет. Чистые функции без DOM — проверяются test/duel.test.mjs.
(function (root) {
  var DAY = 86400;
  var PERIODS = ["all", "month", "last5"];

  // Сессии нужного периода, от новой к старой. «Месяц» отсчитывается от последней
  // сыгранной сессии, а не от сегодняшнего дня, чтобы вкладка не пустела в паузу.
  function pickSessions(sessions, period) {
    var sorted = sessions.slice().sort(function (x, y) { return y.firstPlayedAt - x.firstPlayedAt; });
    if (period === "last5") return sorted.slice(0, 5);
    if (period === "month" && sorted.length) {
      var cutoff = sorted[0].firstPlayedAt - 30 * DAY;
      return sorted.filter(function (s) { return s.firstPlayedAt >= cutoff; });
    }
    return sorted;
  }

  function findPlayer(map, id) {
    var list = map.players || [];
    for (var i = 0; i < list.length; i++) if (list[i].steamid64 === id) return list[i];
    return null;
  }

  // Кто выиграл карту: "a" | "b" | "draw" (команда игрока A против команды игрока B).
  function mapWinner(map, teamA, teamB) {
    var teams = map.teams || [];
    for (var i = 0; i < teams.length; i++) {
      if (teams[i].isWinner) {
        if (teams[i].key === teamA) return "a";
        if (teams[i].key === teamB) return "b";
      }
    }
    return "draw";
  }

  function killsOf(duels, killer, victim) {
    var row = duels && duels.kills && duels.kills[killer];
    return (row && row[victim]) || 0;
  }

  function computeDuel(sessions, idA, idB, opts) {
    if (idA === idB) return null;
    var period = PERIODS.indexOf(opts && opts.period) !== -1 ? opts.period : "all";
    var res = {
      killsA: 0, killsB: 0, winsA: 0, winsB: 0, draws: 0, kd: null,
      maps: [], skipped: [], history: [], together: { maps: 0, wins: 0 },
      bloodiest: null, biggest: null,
    };

    pickSessions(sessions, period).forEach(function (s) {
      s.maps.slice().reverse().forEach(function (m) {
        var pa = findPlayer(m, idA), pb = findPlayer(m, idB);
        if (!pa || !pb) return;
        var row = { sessionId: s.id, playedAt: s.firstPlayedAt, map: m.map, mapId: m.mapId };
        if (pa.team === pb.team) {
          res.together.maps++;
          if (mapWinner(m, pa.team, null) === "a") res.together.wins++;
          return;
        }
        if (!m.duels || !m.duels.kills) { res.skipped.push(row); res.history.push(row); return; }
        row.a = killsOf(m.duels, idA, idB);
        row.b = killsOf(m.duels, idB, idA);
        row.winner = mapWinner(m, pa.team, pb.team);
        res.maps.push(row);
        res.history.push(row);
        res.killsA += row.a;
        res.killsB += row.b;
        if (row.winner === "a") res.winsA++;
        else if (row.winner === "b") res.winsB++;
        else res.draws++;
        // При равенстве побеждает более новая карта: перебор идёт от новых к старым.
        var total = row.a + row.b;
        if (!res.bloodiest || total > res.bloodiest.a + res.bloodiest.b) res.bloodiest = row;
        var margin = Math.abs(row.a - row.b);
        if (margin > 0 && (!res.biggest || margin > Math.abs(res.biggest.a - res.biggest.b))) {
          res.biggest = row;
        }
      });
    });

    if (res.biggest) res.biggest = Object.assign({ leader: res.biggest.a > res.biggest.b ? "a" : "b" }, res.biggest);
    if (res.killsB > 0) res.kd = res.killsA / res.killsB;
    return res;
  }

  // Ссылка на пару: #duel=<idA>,<idB>[,<период>]
  function duelHash(a, b, period) {
    return "#duel=" + a + "," + b + "," + period;
  }

  function parseDuelHash(hash) {
    var m = /^#duel=([^,&]+),([^,&]+)(?:,([a-z0-9]+))?$/.exec(hash || "");
    if (!m) return null;
    return { a: m[1], b: m[2], period: PERIODS.indexOf(m[3]) !== -1 ? m[3] : "all" };
  }

  root.Duel = { computeDuel: computeDuel, duelHash: duelHash, parseDuelHash: parseDuelHash, PERIODS: PERIODS };
})(typeof window !== "undefined" ? window : globalThis);
