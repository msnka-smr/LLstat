// Плавающий порог квалификации: доля от числа карт самого играющего человека.
export function computeThreshold(mapsPlayedCounts, { qualifyShare = 0.3, qualifyMinMaps = 5 } = {}) {
  const maxMaps = mapsPlayedCounts.length ? Math.max(...mapsPlayedCounts) : 0;
  return Math.max(qualifyMinMaps, Math.ceil(qualifyShare * maxMaps));
}
