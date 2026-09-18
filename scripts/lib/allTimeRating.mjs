// Рейтинг "за всё время" — динамический, начинается с 500 и меняется на
// дельту после каждой карты (в хронологическом порядке). Дельта — это смесь
// результата матча (±1) и личного бонуса за K/D этой карты.
//
// Бонус считается относительно ФИКСИРОВАННОЙ базы (K/D=1.0 — "средний"
// уровень), а не собственного среднего игрока за последние карты. Первая
// версия сравнивала карту со своим же средним — для стабильного игрока
// (хорошего или плохого) такой бонус усредняется к нулю независимо от
// абсолютного уровня, и реально накапливался только счёт побед/поражений.
// Из-за этого игрок с явно лучшим K/D, но чуть похуже составом команды,
// стабильно проигрывал в рейтинге игроку с посредственным K/D, но удачным
// винрейтом. Подтверждено на реальных данных перед изменением.
//
// Вес результата матча (0.3) заметно снижен относительно бонуса (0.8) —
// раньше результат весил как полноценное ±1, полностью перекрывая личный
// вклад. Теперь личный уровень накапливается стабильно и может перевесить
// более удачливого по составу игрока.
const START_RATING = 500;
const MIN_RATING = 1;
const MAX_RATING = 10000;
const K_NEW_PLAYER = 8;
const K_ESTABLISHED = 5;
const NEW_PLAYER_MATCHES = 5;
const REFERENCE_KD = 1.0;
const RESULT_WEIGHT = 0.3;
const BONUS_SCALE = 0.8;

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

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const kd = matchKd(m);
    const result = m.won ? 1 : -1;
    const personalBonus = (kd - REFERENCE_KD) * BONUS_SCALE;
    const K = i < NEW_PLAYER_MATCHES ? K_NEW_PLAYER : K_ESTABLISHED;
    const delta = Math.round(K * (result * RESULT_WEIGHT + personalBonus) * 100) / 100;

    const before = rating;
    rating = clamp(rating + delta);
    history.push({ before, delta, after: rating });
  }

  return { rating, history };
}
