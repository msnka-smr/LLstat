// Рейтинг "последняя сессия" — статический, считается один раз по всем
// картам сессии. Входы: K/D ratio (60%), средний K-D diff за карту,
// нормированный к тому же порядку величины (40%), винрейт (10%).
//
// avg_K_D_diff — «сырая» разница килл-смертей за карту (может быть от -15
// до +15), а K/D ratio и WR — величины порядка 0-2 и 0-1. Без нормализации
// разница полностью перекрывала остальные два слагаемых и почти всегда
// утапливала результат в пол. /10 — типичный масштаб разницы фрагов за
// карту, приводит её к тому же порядку, что и K/D ratio.
//
// Итог собран не от нуля, а от базового значения 500 (среднестатистический
// игрок: K/D=1, нейтральный диф, WR=50%) — так разброс входов предсказуемо
// ложится на шкалу вокруг центра, а не улетает в один из краёв.
const MIN_RATING = 1;
const MAX_RATING = 3500;
const DIFF_NORMALIZER = 10;
const BASELINE_SCORE = 1.0 * 0.6 + 0 * 0.4 + 0.5 * 0.1; // = 0.65
const SCALE = 350;
const CENTER = 500;

export function calcSessionRating(matches) {
  if (!matches.length) return null;

  const totalK = matches.reduce((sum, m) => sum + m.k, 0);
  const totalD = matches.reduce((sum, m) => sum + m.d, 0);
  const kdRatio = totalD > 0 ? totalK / totalD : totalK;

  const kdDiffTotal = matches.reduce((sum, m) => sum + (m.k - m.d), 0);
  const avgKdDiff = kdDiffTotal / matches.length;
  const diffNorm = avgKdDiff / DIFF_NORMALIZER;

  const wins = matches.filter((m) => m.won).length;
  const wr = wins / matches.length;

  const score = kdRatio * 0.6 + diffNorm * 0.4 + wr * 0.1;
  const rating = CENTER + (score - BASELINE_SCORE) * SCALE;
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(rating)));
}
