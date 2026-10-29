// Один человек иногда играет с разных steamid64 (второй аккаунт). aliasMap
// сводит такие steamid64 в один канонический — до сессий, агрегации и всего
// остального, чтобы вся статистика альт-аккаунта просто перетекла в основной.
export function applyAliases(maps, aliasMap) {
  if (!aliasMap || !Object.keys(aliasMap).length) return maps;
  const canon = (id) => aliasMap[id] ?? id;
  return maps.map((map) => ({
    ...map,
    // матрица дуэлей ссылается на steamid64 и тоже должна идти за алиасом
    ...(map.duels
      ? {
          duels: {
            kills: Object.fromEntries(
              Object.entries(map.duels.kills).map(([killer, victims]) => [
                canon(killer),
                Object.fromEntries(Object.entries(victims).map(([victim, n]) => [canon(victim), n])),
              ])
            ),
          },
        }
      : {}),
    players: map.players.map((p) => {
      const canonical = aliasMap[p.steamid64];
      // aliased: ник и аватар альт-аккаунта не должны затирать данные основного
      return canonical ? { ...p, steamid64: canonical, aliased: true } : p;
    }),
  }));
}
