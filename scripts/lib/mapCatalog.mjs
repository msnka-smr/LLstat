// Нормальные имена карт для вкладки "Карты". Список расширяем по мере
// появления новых карт в пуле — незнакомое имя не ломает сайт, а просто
// отображается с обрезанным префиксом и заглавной буквы.
const DISPLAY_NAMES = {
  de_mirage: "Mirage",
  de_dust2: "Dust II",
  de_inferno: "Inferno",
  de_nuke: "Nuke",
  de_cache: "Cache",
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_overpass: "Overpass",
  de_train: "Train",
  de_vertigo: "Vertigo",
  cs_office: "Office",
  cs_shelter: "Shelter",
  de_boulder: "Boulder",
  de_fachwerk: "Fachwerk",
};

export function mapDisplayName(rawName) {
  if (!rawName) return rawName;
  if (DISPLAY_NAMES[rawName]) return DISPLAY_NAMES[rawName];
  const stripped = rawName.replace(/^(de|cs|aim|awp)_/, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// maps — нормализованные объекты карт (см. normalize.mjs), только поле .map
// используется. Возвращает уникальные карты с числом игр, самая играемая первой.
export function summarizeMapFrequency(maps) {
  const counts = new Map();
  for (const m of maps) {
    if (!m.map) continue;
    counts.set(m.map, (counts.get(m.map) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([mapKey, timesPlayed]) => ({ mapKey, displayName: mapDisplayName(mapKey), timesPlayed }))
    .sort((a, b) => b.timesPlayed - a.timesPlayed || a.displayName.localeCompare(b.displayName));
}
