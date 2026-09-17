// Вытаскивает id лобби из ссылки вида cybershoke.net/match/<id> (с любой локалью в пути)
// или из голого номера. Берём последнее число из 7+ цифр в строке.
export function extractLobbyId(token) {
  const found = token.match(/\d{7,}/g);
  if (!found) return null;
  return Number(found[found.length - 1]);
}
