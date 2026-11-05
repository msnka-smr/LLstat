// Вкладка «Оружие»: кто из чего убивал. Читает sessions[].maps[].weapons из stats.json
// ({ steamid64: { оружие: [убийства, из них в голову] } }, разбор демки), в агрегаты и
// рейтинги ничего не пишет. Чистые функции без DOM — проверяются test/weapons.test.mjs.
// Выбор периода берёт у window.Duel (duel.js грузится раньше).
(function (root) {
  var MODES = ["card", "leaders", "compare"];
  var MIN_KILLS_FOR_HS = 5; // без порога 1 убийство из 1 в голову давало бы «лучшие 100%»

  // Порядок групп — порядок в списках на странице. noHs: у ножа и гранат «в голову» не бывает.
  var GROUPS = [
    { id: "ak47", label: "AK-47", weapons: ["AK-47"] },
    { id: "m4", label: "M4", weapons: ["M4A1", "M4A4"] },
    { id: "awp", label: "AWP", weapons: ["AWP"] },
    { id: "deagle", label: "Desert Eagle", weapons: ["Desert Eagle"] },
    { id: "rifles", label: "Другие винтовки", weapons: ["Galil AR", "FAMAS", "SG 553", "AUG"] },
    { id: "scout", label: "SSG 08", weapons: ["SSG 08"] },
    { id: "pistols", label: "Пистолеты", weapons: ["USP-S", "Glock-18", "P2000", "P250", "Five-SeveN", "Dual Berettas", "Tec-9", "CZ75 Auto"] },
    { id: "smg", label: "Пистолеты-пулемёты", weapons: ["MP9", "MAC-10", "MP7", "MP5-SD", "P90", "PP-Bizon"] },
    { id: "shotguns", label: "Дробовики", weapons: ["Nova", "XM1014", "MAG-7"] },
    { id: "lmg", label: "Негев", weapons: ["Negev"] },
    { id: "knife", label: "Нож", weapons: ["Knife"], noHs: true },
    { id: "grenades", label: "Гранаты", weapons: ["HE Grenade", "Molotov", "Incendiary Grenade"], noHs: true },
    { id: "other", label: "Прочее", weapons: [] }, // оружие, которого нет в списке выше
  ];
  var GROUP_BY_ID = {};
  var GROUP_OF_WEAPON = {};
  GROUPS.forEach(function (g) {
    GROUP_BY_ID[g.id] = g;
    g.weapons.forEach(function (w) { GROUP_OF_WEAPON[w] = g.id; });
  });

  function groupOf(weapon) {
    return GROUP_OF_WEAPON[weapon] || "other";
  }

  function pc(hs, kills) {
    return kills > 0 ? Math.round((hs / kills) * 100) : null;
  }

  // Суммы по периоду: players[id] = { kills, hs, groups: { gid: { kills, hs, weapons } } }.
  // mapsTotal — все карты периода, mapsCounted — те из них, где есть разбор демки.
  function computeStats(sessions, opts) {
    var period = opts && opts.period;
    var res = { period: period || "all", mapsTotal: 0, mapsCounted: 0, players: {} };
    root.Duel.pickSessions(sessions, period || "all").forEach(function (s) {
      s.maps.forEach(function (m) {
        res.mapsTotal++;
        if (!m.weapons) return;
        res.mapsCounted++;
        Object.keys(m.weapons).forEach(function (id) {
          var p = res.players[id] || (res.players[id] = { kills: 0, hs: 0, groups: {} });
          Object.keys(m.weapons[id]).forEach(function (weapon) {
            var k = m.weapons[id][weapon][0], h = m.weapons[id][weapon][1];
            var g = p.groups[groupOf(weapon)] || (p.groups[groupOf(weapon)] = { kills: 0, hs: 0, weapons: {} });
            var w = g.weapons[weapon] || (g.weapons[weapon] = [0, 0]);
            g.kills += k; g.hs += h; w[0] += k; w[1] += h;
            p.kills += k; p.hs += h;
          });
        });
      });
    });
    return res;
  }

  // Строки по убийствам (больше — выше), при равенстве выше тот, у кого больше хедшотов;
  // место считается только по убийствам, равные делят его.
  function ranked(rows) {
    rows.sort(function (x, y) { return y.kills - x.kills || y.hs - x.hs || (x.id < y.id ? -1 : 1); });
    rows.forEach(function (r, i) {
      r.place = i > 0 && rows[i - 1].kills === r.kills ? rows[i - 1].place : i + 1;
    });
    return rows;
  }

  // Рейтинг игроков на одной группе оружия.
  function leaders(stats, gid) {
    var rows = [];
    Object.keys(stats.players).forEach(function (id) {
      var g = stats.players[id].groups[gid];
      if (g && g.kills > 0) rows.push({ id: id, kills: g.kills, hs: g.hs, hsPc: pc(g.hs, g.kills) });
    });
    return ranked(rows);
  }

  // Арсенал одного игрока: группы по убийствам, доля от всех его убийств, место среди друзей.
  function playerCard(stats, id) {
    var p = stats.players[id];
    if (!p || !p.kills) return null;
    var rows = Object.keys(p.groups).map(function (gid) {
      var g = p.groups[gid];
      var board = leaders(stats, gid);
      var place = 0;
      board.forEach(function (r) { if (r.id === id) place = r.place; });
      return {
        gid: gid, kills: g.kills, hs: g.hs, hsPc: pc(g.hs, g.kills),
        share: Math.round((g.kills / p.kills) * 100), place: place, of: board.length,
      };
    });
    rows.sort(function (x, y) { return y.kills - x.kills || GROUPS.indexOf(GROUP_BY_ID[x.gid]) - GROUPS.indexOf(GROUP_BY_ID[y.gid]); });
    return { kills: p.kills, hs: p.hs, favorite: rows[0].gid, rows: rows };
  }

  // Таблица «оружие × игроки»; best — лучшая ячейка строки (по убийствам или по HS%).
  // Ноль не бывает лучшим, а HS% засчитывается только от MIN_KILLS_FOR_HS убийств.
  function compare(stats, ids, gids, metric) {
    var byHs = metric === "hsPc";
    return {
      metric: byHs ? "hsPc" : "kills",
      rows: gids.map(function (gid) {
        var cells = ids.map(function (id) {
          var g = stats.players[id] && stats.players[id].groups[gid];
          var kills = g ? g.kills : 0, hs = g ? g.hs : 0;
          var value = byHs ? (kills >= MIN_KILLS_FOR_HS ? pc(hs, kills) : null) : kills;
          return { id: id, kills: kills, hs: hs, hsPc: pc(hs, kills), value: value };
        });
        var top = 0;
        cells.forEach(function (c) { if (c.value != null && c.value > top) top = c.value; });
        cells.forEach(function (c) { c.best = top > 0 && c.value === top; delete c.value; });
        return { gid: gid, cells: cells };
      }),
    };
  }

  // Ссылка на вид: #weapons=<режим>/<период>/<игроки через +>/<группы через +>
  function weaponsHash(v) {
    return "#weapons=" + v.mode + "/" + v.period + "/" + v.players.join("+") + "/" + v.groups.join("+");
  }

  function parseWeaponsHash(hash) {
    var m = /^#weapons=([a-z]+)\/([a-z0-9]+)\/([^/]*)\/([^/]*)$/.exec(hash || "");
    if (!m || MODES.indexOf(m[1]) === -1) return null;
    var split = function (s) { return s ? s.split("+").filter(Boolean) : []; };
    return {
      mode: m[1],
      period: root.Duel.PERIODS.indexOf(m[2]) !== -1 ? m[2] : "all",
      players: split(m[3]),
      groups: split(m[4]).filter(function (g) { return !!GROUP_BY_ID[g]; }),
    };
  }

  root.Weapons = {
    GROUPS: GROUPS, MODES: MODES, MIN_KILLS_FOR_HS: MIN_KILLS_FOR_HS,
    groupOf: groupOf, computeStats: computeStats, leaders: leaders, playerCard: playerCard,
    compare: compare, weaponsHash: weaponsHash, parseWeaponsHash: parseWeaponsHash,
  };
})(typeof window !== "undefined" ? window : globalThis);
