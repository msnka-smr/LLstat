import { calculateRating } from "./rating.mjs";

// Агрегирует карты одного игрока за период. K/D/A/победы считаются по всем картам
// (full + basic), а KAST/KPR/DPR/ADR — только по full-tier, взвешенно по раундам,
// а не как среднее по картам: KPR = Σkills / Σrounds, KAST = ΣkastRounds / Σrounds,
// ADR = Σ(adr·rounds) / Σrounds.
export function aggregatePlayerMaps(mapsForPlayer) {
  let mapsPlayed = 0;
  let wins = 0;
  let k = 0;
  let d = 0;
  let a = 0;
  let hsKills = 0;
  let fk = 0;
  let fd = 0;
  let mvp = 0;
  let mk3plus = 0;
  let clutchesWon = 0;
  let clutchSituations = 0;

  let fullTierMaps = 0;
  let fullTierRounds = 0;
  let fullTierK = 0;
  let fullTierD = 0;
  let fullTierA = 0;
  let kastRoundsSum = 0; // Σ (kast/100 * rounds)
  let adrRoundsSum = 0; // Σ (adr * rounds)

  for (const m of mapsForPlayer) {
    mapsPlayed++;
    if (m.won) wins++;
    k += m.k ?? 0;
    d += m.d ?? 0;
    a += m.a ?? 0;
    hsKills += m.hsKills ?? 0;

    // rounds/kast/adr отсутствуют не только на basic-tier картах, но и когда
    // демо-парсер cybershoke уронил конкретного игрока с полной full-tier карты
    // (see normalize.mjs) — в обоих случаях рейтинг по этой карте не считаем.
    const hasRatingInputs = m.rounds != null && m.kast != null && m.adr != null;
    if (hasRatingInputs) {
      fullTierMaps++;
      const rounds = m.rounds;
      fullTierRounds += rounds;
      fullTierK += m.k ?? 0;
      fullTierD += m.d ?? 0;
      fullTierA += m.a ?? 0;
      kastRoundsSum += (m.kast / 100) * rounds;
      adrRoundsSum += m.adr * rounds;
      fk += m.fk ?? 0;
      fd += m.fd ?? 0;
      mvp += m.mvp ?? 0;
      clutchesWon += m.clutchesWon ?? 0;
      clutchSituations += m.clutchSituations ?? 0;
      if (m.multikills) {
        mk3plus += (m.multikills.k3 ?? 0) + (m.multikills.k4 ?? 0) + (m.multikills.k5 ?? 0);
      }
    }
  }

  const losses = mapsPlayed - wins;
  const kd = d > 0 ? k / d : k;
  const hsPercent = k > 0 ? (hsKills / k) * 100 : null;

  let kpr = null;
  let dpr = null;
  let apr = null;
  let kast = null;
  let adr = null;
  let rating = null;

  if (fullTierRounds > 0) {
    kpr = fullTierK / fullTierRounds;
    dpr = fullTierD / fullTierRounds;
    apr = fullTierA / fullTierRounds;
    kast = (kastRoundsSum / fullTierRounds) * 100;
    adr = adrRoundsSum / fullTierRounds;
    rating = calculateRating({ kast, kpr, dpr, apr, adr });
  }

  return {
    mapsPlayed,
    wins,
    losses,
    k,
    d,
    a,
    kd,
    hsPercent,
    fk,
    fd,
    mvp,
    mk3plus,
    clutchesWon,
    clutchSituations,
    fullTierMaps,
    fullTierRounds,
    kpr,
    dpr,
    apr,
    kast,
    adr,
    rating,
  };
}
