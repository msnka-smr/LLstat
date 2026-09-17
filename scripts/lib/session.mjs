// Разбиение карт на сессии: пауза больше SESSION_GAP_HOURS начинает новую сессию.
// Id сессии — дата первой карты в заданной таймзоне; при второй сессии в тот же день — суффикс -2, -3...
function formatDateInTimeZone(unixSeconds, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

// Принимает массив карт с полем playedAt (unix-секунды), мутирует их, добавляя sessionId.
// Возвращает { maps (отсортированы по времени), sessions: [{ id, firstPlayedAt, lastPlayedAt, maps }] }.
export function assignSessions(maps, { gapHours = 6, timezone = "Europe/Samara" } = {}) {
  const sorted = [...maps].sort((a, b) => a.playedAt - b.playedAt);
  const gapSeconds = gapHours * 3600;

  const sessions = [];
  let current = null;
  for (const map of sorted) {
    if (!current || map.playedAt - current.lastPlayedAt > gapSeconds) {
      current = { firstPlayedAt: map.playedAt, lastPlayedAt: map.playedAt, maps: [] };
      sessions.push(current);
    } else if (map.playedAt > current.lastPlayedAt) {
      current.lastPlayedAt = map.playedAt;
    }
    current.maps.push(map);
  }

  const dateCounts = new Map();
  for (const session of sessions) {
    const dateStr = formatDateInTimeZone(session.firstPlayedAt, timezone);
    const count = (dateCounts.get(dateStr) ?? 0) + 1;
    dateCounts.set(dateStr, count);
    session.id = count === 1 ? dateStr : `${dateStr}-${count}`;
    for (const map of session.maps) map.sessionId = session.id;
  }

  return { maps: sorted, sessions };
}
