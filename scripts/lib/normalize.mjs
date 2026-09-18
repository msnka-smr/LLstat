// Превращает сырой ответ lobbys/info в один или несколько объектов «нормализованная карта».
// Данные всегда берутся из лобби (счёт команд + live K/D на игрока) — по
// демо-разбору (ADR, KAST, раунды по игроку и т.п.) больше не считаем: этот
// источник у cybershoke прошёл нестабильным (заражённые смерти, ножевые
// раунды, KAST выше 100%). Каждый игрок несёт только steamid64, имя, аватар,
// команду, победу и K/D.
export function normalizeLobby(raw) {
  const data = raw?.data;
  if (!data) return [];

  const playedAtFallback =
    data.dates?.unixtime_match_end ?? data.dates?.unixtime_start_match ?? null;

  const mmsStats = data.match_more_stats?.stats;
  const mmsMaps = data.match_more_stats?.maps;

  // Полный разбор демки (когда он есть) всё равно содержит счёт по картам и
  // K/D — берём их оттуда тем же способом, что и из лобби, с той же
  // поправкой на фантомный ножевой раунд.
  if (mmsStats?.status === "finished" && mmsMaps) {
    return Object.entries(mmsMaps)
      .map(([mapIndexStr, mapEntry]) =>
        normalizeFullMap({
          lobbyId: data.id_lobby,
          mapIndex: Number(mapIndexStr),
          stats: mapEntry.stats,
          playedAtFallback,
          roster: data.players ?? {},
        })
      )
      .filter(Boolean);
  }

  return [normalizeBasicMap({ lobbyId: data.id_lobby, data, playedAtFallback })];
}

// Лобби с enable_knife_round периодически заводят ножевой раунд (выбор
// стороны) прямо в demo — cybershoke иногда засчитывает его как настоящий
// раунд №1, добавляя +1 очко победившей его команде и +1 к totalRounds.
// Признак: все килы раунда №1 — оружием "Knife" (обычные раунды такого не
// дают). Проверено на трёх картах одной сессии против скриншотов из клиента
// CS2 — расхождение исчезает ровно там и только там, где сработал этот признак.
//
// У cybershoke это же протекает и в личную статистику: p.kills уже сам по
// себе не считает килы ножевого раунда (проверено на всей истории — совпадает
// без исключений), а вот p.deaths его включает всегда — вычитаем смерть в
// этом раунде точечно, по конкретному steamid64 из events.
function detectPhantomKnifeRound(stats) {
  const round1 = stats.rounds?.[0];
  if (!round1?.events?.length) return null;
  const allKnife = round1.events.every((e) => e.weapon === "Knife");
  if (!allKnife) return null;
  const deathsBySteamId = new Map();
  for (const e of round1.events) {
    const id = String(e.victimSteam);
    deathsBySteamId.set(id, (deathsBySteamId.get(id) ?? 0) + 1);
  }
  return { winner: round1.winner, deathsBySteamId };
}

function normalizeFullMap({ lobbyId, mapIndex, stats, playedAtFallback, roster }) {
  if (!stats) return null;
  const phantom = detectPhantomKnifeRound(stats);
  const totalRounds = phantom ? (stats.totalRounds ?? 0) - 1 : stats.totalRounds ?? 0;
  const teams = ["team1", "team2"].map((key) => ({
    key,
    name: stats[key]?.name ?? null,
    score: key === phantom?.winner ? (stats[key]?.score ?? 0) - 1 : stats[key]?.score ?? null,
    isWinner: !!stats[key]?.isWinner,
  }));

  const players = [];
  const seenSteamIds = new Set();
  for (const teamKey of ["team1", "team2"]) {
    const teamIsWinner = !!stats[teamKey]?.isWinner;
    for (const p of stats[teamKey]?.players ?? []) {
      const phantomDeaths = phantom?.deathsBySteamId.get(String(p.steamid64)) ?? 0;
      seenSteamIds.add(String(p.steamid64));
      players.push({
        steamid64: String(p.steamid64),
        name: p.name,
        avatar: roster[String(p.steamid64)]?.avatar ?? null,
        team: teamKey,
        won: teamIsWinner,
        k: p.kills ?? 0,
        d: (p.deaths ?? 0) - phantomDeaths,
      });
    }
  }

  // Демо-парсер cybershoke иногда молча роняет игрока из team1/team2.players
  // (подтверждено на живом матче), хотя тот был в лобби и его K/D видны на
  // странице матча. Добираем таких из data.players[].match_stats.live по
  // id_slot: slot игрока сверяем со slot'ами уже найденных игроков той же
  // stats-команды, чтобы понять, к какой из team1/team2 он относится.
  const slotToTeamKey = new Map();
  for (const teamKey of ["team1", "team2"]) {
    for (const p of stats[teamKey]?.players ?? []) {
      const slot = roster[String(p.steamid64)]?.id_slot;
      if (slot != null) slotToTeamKey.set(slot, teamKey);
    }
  }
  for (const [steamid64, rp] of Object.entries(roster)) {
    if (seenSteamIds.has(steamid64)) continue;
    const teamKey = slotToTeamKey.get(rp.id_slot);
    if (!teamKey) continue; // не игровой слот (спектатор и т.п.) или команду не определить
    const live = rp.match_stats?.live;
    if (!live) continue; // и демо, и live-статы отсутствуют — добрать нечем
    players.push({
      steamid64,
      name: rp.name,
      avatar: rp.avatar ?? null,
      team: teamKey,
      won: !!stats[teamKey]?.isWinner,
      k: live.kills ?? 0,
      d: live.deaths ?? 0,
    });
  }

  return {
    mapId: `${lobbyId}:${mapIndex}`,
    lobbyId,
    mapIndex,
    map: stats.map ?? null,
    playedAt: playedAtFallback,
    totalRounds: totalRounds || null,
    teams,
    players,
    statsTier: "full",
  };
}

function normalizeBasicMap({ lobbyId, data, playedAtFallback }) {
  const base = data.match_stats?.base ?? {};
  const winnerSlot = base.team_winner ?? null;
  const teamKeys = Object.keys(base).filter((k) => k.startsWith("team_") && k !== "team_winner");
  const totalRounds = teamKeys.reduce((sum, k) => sum + (base[k]?.score ?? 0), 0) || null;

  const players = Object.values(data.players ?? {}).map((p) => {
    const live = p.match_stats?.live ?? {};
    const slot = p.id_slot;
    const team = teamKeys.includes(`team_${slot}`) ? `team_${slot}` : null;
    return {
      steamid64: String(p.steamid64),
      name: p.name,
      avatar: p.avatar ?? null,
      team,
      won: team != null && winnerSlot != null ? slot === winnerSlot : null,
      k: live.kills ?? 0,
      d: live.deaths ?? 0,
    };
  });

  return {
    mapId: `${lobbyId}:1`,
    lobbyId,
    mapIndex: 1,
    map: data.match_settings?.map_name ?? null,
    playedAt: playedAtFallback,
    totalRounds,
    teams: teamKeys.map((k) => ({
      key: k,
      name: null,
      score: base[k]?.score ?? null,
      isWinner: k === `team_${winnerSlot}`,
    })),
    players,
    statsTier: "basic",
  };
}
