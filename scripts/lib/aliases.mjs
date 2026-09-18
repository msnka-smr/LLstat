// Один человек иногда играет с разных steamid64 (второй аккаунт). aliasMap
// сводит такие steamid64 в один канонический — до сессий, агрегации и всего
// остального, чтобы вся статистика альт-аккаунта просто перетекла в основной.
export function applyAliases(maps, aliasMap) {
  if (!aliasMap || !Object.keys(aliasMap).length) return maps;
  return maps.map((map) => ({
    ...map,
    players: map.players.map((p) => {
      const canonical = aliasMap[p.steamid64];
      return canonical ? { ...p, steamid64: canonical } : p;
    }),
  }));
}
