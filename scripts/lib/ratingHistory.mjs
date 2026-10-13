// История рейтинга "за всё время" по сессиям — для графика на вкладке
// "За всё время". Для каждой сессии берём рейтинг игрока после его последней
// карты этого вечера; если он в этот вечер не играл — рейтинг не менялся,
// значение продолжается; до первой сыгранной сессии — null (линии нет).
//
// sessions — от старой к новой (как отдаёт assignSessions).
// playersData[steamid64] = { matches, history }: matches хронологичны и несут
// sessionId, history — параллельный результат computeAllTimeRating.
export function computeRatingHistory(sessions, playersData) {
  const players = {};
  for (const [steamid64, { matches, history }] of Object.entries(playersData)) {
    const afterBySession = new Map();
    matches.forEach((m, i) => {
      // карты идут по времени, поэтому последняя запись сессии перезаписывает ранние
      afterBySession.set(m.sessionId, history[i].after);
    });

    let carried = null;
    players[steamid64] = sessions.map((s) => {
      if (afterBySession.has(s.id)) carried = Math.round(afterBySession.get(s.id));
      return carried;
    });
  }

  return {
    sessions: sessions.map((s) => ({ id: s.id, firstPlayedAt: s.firstPlayedAt })),
    players,
  };
}
