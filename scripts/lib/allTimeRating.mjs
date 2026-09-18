// Рейтинг "за всё время" — динамический, начинается с 500 и меняется на
// дельту после каждой карты (в хронологическом порядке). Дельта зависит от
// результата (+1/-1) и от того, насколько K/D этой карты отличается от
// среднего K/D игрока за последние 30 карт. Первые 5 карт нового игрока
// считаются с повышенным коэффициентом (K=8), чтобы быстрее найти уровень.
const START_RATING = 500;
const MIN_RATING = 1;
const MAX_RATING = 10000;
const LAST_N_FOR_AVG = 30;
const K_NEW_PLAYER = 8;
const K_ESTABLISHED = 5;
const NEW_PLAYER_MATCHES = 5;
const DEFAULT_AVG_KD = 1.0;

function matchKd(m) {
  return m.d > 0 ? m.k / m.d : m.k;
}

function clamp(rating) {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
}

// matches должны быть в хронологическом порядке (от старой к новой).
export function computeAllTimeRating(matches) {
  let rating = START_RATING;
  const history = [];
  const kdSoFar = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const last30 = kdSoFar.slice(-LAST_N_FOR_AVG);
    const avgKd = last30.length ? last30.reduce((s, v) => s + v, 0) / last30.length : DEFAULT_AVG_KD;

    const kd = matchKd(m);
    const result = m.won ? 1 : -1;
    const personalBonus = (kd - avgKd) * 0.5;
    const K = i < NEW_PLAYER_MATCHES ? K_NEW_PLAYER : K_ESTABLISHED;
    const delta = Math.round(K * (result + personalBonus) * 100) / 100;

    const before = rating;
    rating = clamp(rating + delta);
    history.push({ before, delta, after: rating });
    kdSoFar.push(kd);
  }

  return { rating, history };
}
