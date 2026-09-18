// Агрегирует карты одного игрока за период. Только K/D/A-класс данных из
// лобби — рейтинг и всё, что раньше считалось по демо-разбору (ADR, KAST,
// раунды на игрока), сюда не входит: эта логика будет пересобрана отдельно.
export function aggregatePlayerMaps(mapsForPlayer) {
  let mapsPlayed = 0;
  let wins = 0;
  let k = 0;
  let d = 0;

  for (const m of mapsForPlayer) {
    mapsPlayed++;
    if (m.won) wins++;
    k += m.k ?? 0;
    d += m.d ?? 0;
  }

  const losses = mapsPlayed - wins;
  const kd = d > 0 ? k / d : k;

  return { mapsPlayed, wins, losses, k, d, kd };
}
