// Превращает сырой ответ lobbys/info в один или несколько объектов «нормализованная карта».
// full-tier берётся из match_more_stats.maps[N].stats (для BO-серий — по одному на карту).
// basic-tier — из match_stats.base + data.players[].match_stats.live, ровно один mapIndex=1.
export function normalizeLobby(raw) {
  const data = raw?.data;
  if (!data) return [];

  const playedAtFallback =
    data.dates?.unixtime_match_end ?? data.dates?.unixtime_start_match ?? null;

  const mmsStats = data.match_more_stats?.stats;
  const mmsMaps = data.match_more_stats?.maps;

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

function normalizeFullMap({ lobbyId, mapIndex, stats, playedAtFallback, roster }) {
  if (!stats) return null;
  const teams = ["team1", "team2"].map((key) => ({
    key,
    name: stats[key]?.name ?? null,
    score: stats[key]?.score ?? null,
    isWinner: !!stats[key]?.isWinner,
  }));

  const players = [];
  const seenSteamIds = new Set();
  for (const teamKey of ["team1", "team2"]) {
    const teamIsWinner = !!stats[teamKey]?.isWinner;
    for (const p of stats[teamKey]?.players ?? []) {
      // stats.totalRounds — надёжное число раундов карты. p.roundsPlayed у
      // некоторых игроков (похоже, из-за реконнектов) бывает кратно больше
      // totalRounds — используем его только для реконструкции kast (числитель
      // kastRounds страдает тем же искажением, так что оно взаимно гасится),
      // а не как знаменатель для KPR/DPR/APR.
      const rounds = stats.totalRounds || p.roundsPlayed || 0;
      const kast =
        p.kastRounds != null && p.roundsPlayed ? (p.kastRounds / p.roundsPlayed) * 100 : p.kast ?? 0;
      seenSteamIds.add(String(p.steamid64));
      players.push({
        steamid64: String(p.steamid64),
        name: p.name,
        avatar: roster[String(p.steamid64)]?.avatar ?? null,
        team: teamKey,
        won: teamIsWinner,
        rounds,
        k: p.kills ?? 0,
        d: p.deaths ?? 0,
        a: p.assists ?? 0,
        adr: p.adr ?? 0,
        kast,
        hsKills: p.hsKills ?? 0,
        fk: p.entries?.fk ?? 0,
        fd: p.entries?.fd ?? 0,
        openingAttempts: p.entries?.attempts ?? 0,
        mvp: p.mvp ?? 0,
        multikills: p.multikills ?? { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 },
        clutchesWon: p.clutchTotals?.won ?? 0,
        clutchSituations: p.clutchTotals?.situations ?? 0,
      });
    }
  }

  // Демо-парсер cybershoke иногда молча роняет игрока из team1/team2.players
  // (подтверждено на живом матче), хотя тот был в лобби и его K/D/A видны на
  // странице матча. Добираем таких из data.players[].match_stats.live по id_slot:
  // slot игрока сверяем со slot'ами уже найденных игроков той же stats-команды,
  // чтобы понять, к какой из team1/team2 он относится. Без демо-данных у него
  // нет rounds/adr/kast — в рейтинг эта карта для него не идёт, но K/D/A и W/L учтены.
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
      rounds: null,
      k: live.kills ?? 0,
      d: live.deaths ?? 0,
      a: live.assists ?? 0,
      adr: null,
      kast: null,
      hsKills: live.headshots ?? 0,
      fk: null,
      fd: null,
      openingAttempts: null,
      mvp: null,
      multikills: null,
      clutchesWon: null,
      clutchSituations: null,
    });
  }

  return {
    mapId: `${lobbyId}:${mapIndex}`,
    lobbyId,
    mapIndex,
    map: stats.map ?? null,
    playedAt: playedAtFallback,
    totalRounds: stats.totalRounds ?? null,
    durationSec: stats.durationSec ?? null,
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
      rounds: null,
      k: live.kills ?? 0,
      d: live.deaths ?? 0,
      a: live.assists ?? 0,
      adr: null,
      kast: null,
      hsKills: live.headshots ?? 0,
      fk: null,
      fd: null,
      openingAttempts: null,
      mvp: null,
      multikills: null,
      clutchesWon: null,
      clutchSituations: null,
    };
  });

  return {
    mapId: `${lobbyId}:1`,
    lobbyId,
    mapIndex: 1,
    map: data.match_settings?.map_name ?? null,
    playedAt: playedAtFallback,
    totalRounds,
    durationSec: null,
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
