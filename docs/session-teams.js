// Команды вечера для таблицы на вкладке «Сессии». Обычно весь вечер играют одними и теми
// же двумя командами, но ключи команд (team1/team2) на разных картах могут меняться
// местами, поэтому команды выводим из того, кто с кем играл в одной команде: игроки одной
// команды на любой карте склеиваются. Если получилось ровно две группы — это команды вечера;
// если составы перемешивали (группа одна) или данных о командах нет — null, подсветки нет.
// Чистая функция без DOM — проверяется test/session-teams.test.mjs.
(function (root) {
  function split(session) {
    var parent = {};
    var order = [];
    function find(id) {
      while (parent[id] !== id) {
        parent[id] = parent[parent[id]];
        id = parent[id];
      }
      return id;
    }

    (session.maps || []).forEach(function (m) {
      var firstOfTeam = {};
      (m.players || []).forEach(function (p) {
        if (!p.team) return;
        if (!(p.steamid64 in parent)) { parent[p.steamid64] = p.steamid64; order.push(p.steamid64); }
        if (firstOfTeam[p.team] === undefined) firstOfTeam[p.team] = p.steamid64;
        else parent[find(p.steamid64)] = find(firstOfTeam[p.team]);
      });
    });

    if (!order.length) return null;
    var roots = [];
    order.forEach(function (id) { if (roots.indexOf(find(id)) === -1) roots.push(find(id)); });
    if (roots.length !== 2) return null;

    // Команда №0 — та, где первый игрок первой карты, остальное по порядку появления.
    var teamOf = {};
    var sizes = [0, 0];
    order.forEach(function (id) {
      var t = roots.indexOf(find(id));
      teamOf[id] = t;
      sizes[t]++;
    });
    return { teamOf: teamOf, sizes: sizes };
  }

  root.SessionTeams = { split: split };
})(typeof window !== "undefined" ? window : globalThis);
