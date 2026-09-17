// HLTV Rating 2.0, коэффициенты из публичной регрессии (см. SPEC.md, раздел «Рейтинг игрока»).
const COEF = {
  kast: 0.00738764,
  kpr: 0.35912389,
  dpr: -0.5329508,
  impact: 0.2372603,
  adr: 0.0032397,
  intercept: 0.15872723,
};

// kast — в процентах (83, не 0.83); kpr/dpr/apr — за раунд; adr — урон за раунд.
export function calculateImpact({ kpr, apr }) {
  return 2.13 * kpr + 0.42 * apr - 0.41;
}

export function calculateRating({ kast, kpr, dpr, apr, adr }) {
  const impact = calculateImpact({ kpr, apr });
  return (
    COEF.kast * kast +
    COEF.kpr * kpr +
    COEF.dpr * dpr +
    COEF.impact * impact +
    COEF.adr * adr +
    COEF.intercept
  );
}
