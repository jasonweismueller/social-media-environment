// A-priori sample-size / achieved-power calculators for planning an
// experiment-group study before any data exists. Pure functions only — no
// survey/response data, no React/backend knowledge — deliberately
// self-contained (own normal + chi-square approximations) rather than
// importing utils-survey-analysis.js's private helpers, since this is a
// conceptually separate concern: planning a study, not analyzing one that's
// already collecting.

export const COHEN_D = { small: 0.2, medium: 0.5, large: 0.8 };
export const COHEN_DZ = { small: 0.2, medium: 0.5, large: 0.8 };
export const COHEN_F = { small: 0.1, medium: 0.25, large: 0.4 };
export const COHEN_W = { small: 0.1, medium: 0.3, large: 0.5 };
export const COHEN_R = { small: 0.1, medium: 0.3, large: 0.5 };

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Standard normal CDF via the Abramowitz & Stegun 7.1.26 erf approximation.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
    a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.15e-9).
export function normalQuantile(p) {
  if (!(p > 0) || !(p < 1)) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0];
  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ---- Two independent groups, continuous outcome (Cohen's d) ----
// Cohen's (1988) normal-approximation formula — the standard method for
// a-priori planning. The real analysis this app runs (welchTTest) is exact;
// this slightly over-estimates n relative to the exact noncentral-t solution,
// which is the safer direction to be wrong in for a recruitment target.
export function sampleSizeTwoMeans({ d, alpha = 0.05, power = 0.8, tails = 2 }) {
  const absD = Math.abs(d);
  if (!(absD > 0)) return null;
  const zAlpha = normalQuantile(tails === 1 ? 1 - alpha : 1 - alpha / 2);
  const zPower = normalQuantile(power);
  return Math.ceil((2 * (zAlpha + zPower) ** 2) / (absD * absD));
}

export function achievedPowerTwoMeans({ d, n, alpha = 0.05, tails = 2 }) {
  const absD = Math.abs(d);
  if (!(absD > 0) || !(n > 0)) return null;
  const delta = absD * Math.sqrt(n / 2);
  if (tails === 1) {
    const zAlpha = normalQuantile(1 - alpha);
    return clamp01(normalCDF(delta - zAlpha));
  }
  const zAlpha2 = normalQuantile(1 - alpha / 2);
  return clamp01(1 - normalCDF(zAlpha2 - delta) + normalCDF(-zAlpha2 - delta));
}

// Smallest effect size giving power >= target for a monotonic-in-effect-size
// achievedPower function — shared by every family's "sensitivity" mode
// (minimum detectable effect given a fixed N). Exponential search to bracket,
// then bisection; safe because every achievedPower* function here is
// monotonic increasing in its effect-size argument by construction.
function solveEffectSizeForPower(achievedPowerOfEffect, targetPower, { lo = 1e-4, hi = 3 } = {}) {
  let tries = 0;
  while (achievedPowerOfEffect(hi) < targetPower && tries < 60) { hi *= 1.7; tries++; }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (achievedPowerOfEffect(mid) < targetPower) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function minDetectableEffectTwoMeans({ n, alpha = 0.05, power = 0.8, tails = 2 }) {
  if (!(n > 1)) return null;
  return solveEffectSizeForPower((d) => achievedPowerTwoMeans({ d, n, alpha, tails }), power);
}

// ---- Paired / one-sample comparison (Cohen's dz = mean difference / SD of
// differences) — the same z-approximation family as two independent means,
// just the one-sample form (no /2 factor, since the test runs on a single
// column of difference scores, not two independent groups). ----
export function sampleSizePairedMeans({ dz, alpha = 0.05, power = 0.8, tails = 2 }) {
  const absDz = Math.abs(dz);
  if (!(absDz > 0)) return null;
  const zAlpha = normalQuantile(tails === 1 ? 1 - alpha : 1 - alpha / 2);
  const zPower = normalQuantile(power);
  return Math.ceil(((zAlpha + zPower) ** 2) / (absDz * absDz));
}

export function achievedPowerPairedMeans({ dz, n, alpha = 0.05, tails = 2 }) {
  const absDz = Math.abs(dz);
  if (!(absDz > 0) || !(n > 0)) return null;
  const delta = absDz * Math.sqrt(n);
  if (tails === 1) {
    const zAlpha = normalQuantile(1 - alpha);
    return clamp01(normalCDF(delta - zAlpha));
  }
  const zAlpha2 = normalQuantile(1 - alpha / 2);
  return clamp01(1 - normalCDF(zAlpha2 - delta) + normalCDF(-zAlpha2 - delta));
}

export function minDetectableEffectPairedMeans({ n, alpha = 0.05, power = 0.8, tails = 2 }) {
  if (!(n > 1)) return null;
  return solveEffectSizeForPower((dz) => achievedPowerPairedMeans({ dz, n, alpha, tails }), power);
}

// Pooled-SD Cohen's d from raw group means/SDs (falls back to a plain average
// of the two SDs — not variance-weighted — when group sizes aren't given,
// e.g. a researcher planning from a pilot's reported means/SDs only).
export function cohensDFromMeans({ mean1, sd1, n1, mean2, sd2, n2 }) {
  if (!(sd1 >= 0) || !(sd2 >= 0) || mean1 == null || mean2 == null) return null;
  let pooledSd;
  if (n1 > 1 && n2 > 1) {
    pooledSd = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
  } else {
    pooledSd = Math.sqrt((sd1 * sd1 + sd2 * sd2) / 2);
  }
  if (!(pooledSd > 0)) return null;
  return (mean1 - mean2) / pooledSd;
}

// Cohen's f for 2+ groups directly from each group's {n, mean, sd} — the
// standard "SD of the group means, relative to the pooled within-group SD"
// definition (f = sigma_m / sigma). Lets a researcher compute an a-priori-
// style effect size straight from a set of group summary stats (e.g. a pilot
// or an already-collecting study), the same role sampleSizeTwoMeans/
// cohensDFromMeans play for the two-group case.
export function cohensFFromGroups(perGroup) {
  const groups = (perGroup || []).filter((g) => g && g.n > 0 && g.mean != null && g.sd != null);
  if (groups.length < 2) return null;
  const totalN = groups.reduce((s, g) => s + g.n, 0);
  const grandMean = groups.reduce((s, g) => s + g.mean * g.n, 0) / totalN;
  const ssBetween = groups.reduce((s, g) => s + g.n * (g.mean - grandMean) ** 2, 0);
  const ssWithin = groups.reduce((s, g) => s + Math.max(0, g.n - 1) * g.sd * g.sd, 0);
  const dfWithin = totalN - groups.length;
  if (!(dfWithin > 0) || !(ssWithin > 0)) return null;
  const msWithin = ssWithin / dfWithin;
  const varBetween = ssBetween / totalN;
  return Math.sqrt(varBetween / msWithin);
}

// Cohen's w from an already-computed chi-square statistic + its total N
// (w = sqrt(chi-square / N)) — a one-line derivation, exposed here so the
// power-analysis UI can read an "observed" w straight off the app's own
// chiSquareTest() output without duplicating the formula inline.
export function cohensWFromChiSquare(chisq, n) {
  if (!(chisq >= 0) || !(n > 0)) return null;
  return Math.sqrt(chisq / n);
}

// ---- Correlation (Pearson's r) — Cohen's (1988) Fisher-z method, the
// standard approach: the sampling distribution of atanh(r) is approximately
// normal with SE = 1/sqrt(n-3), so this reuses the exact same
// normal-approximation shape as the two-means/paired families above. ----
function fisherZ(r) {
  const c = Math.max(-0.999999, Math.min(0.999999, r));
  return 0.5 * Math.log((1 + c) / (1 - c));
}

export function sampleSizeCorrelation({ r, alpha = 0.05, power = 0.8, tails = 2 }) {
  const zr = Math.abs(fisherZ(r));
  if (!(zr > 0)) return null;
  const zAlpha = normalQuantile(tails === 1 ? 1 - alpha : 1 - alpha / 2);
  const zPower = normalQuantile(power);
  return Math.ceil(((zAlpha + zPower) / zr) ** 2 + 3);
}

export function achievedPowerCorrelation({ r, n, alpha = 0.05, tails = 2 }) {
  const zr = Math.abs(fisherZ(r));
  if (!(zr > 0) || !(n > 3)) return null;
  const delta = zr * Math.sqrt(n - 3);
  if (tails === 1) {
    const zAlpha = normalQuantile(1 - alpha);
    return clamp01(normalCDF(delta - zAlpha));
  }
  const zAlpha2 = normalQuantile(1 - alpha / 2);
  return clamp01(1 - normalCDF(zAlpha2 - delta) + normalCDF(-zAlpha2 - delta));
}

export function minDetectableEffectCorrelation({ n, alpha = 0.05, power = 0.8, tails = 2 }) {
  if (!(n > 3)) return null;
  return solveEffectSizeForPower((r) => achievedPowerCorrelation({ r, n, alpha, tails }), power, { lo: 1e-4, hi: 0.9 });
}

// ---- Shared noncentral chi-square machinery (used by the chi-square test
// exactly, and by one-way ANOVA as Cohen's own standard planning
// approximation to the noncentral F when df1 is small — see below) ----

function logGamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const xm1 = x - 1;
  let a = c[0];
  const t = xm1 + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (xm1 + i);
  return 0.5 * Math.log(2 * Math.PI) + (xm1 + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammaSeriesP(a, x) {
  if (x <= 0) return 0;
  let sum = 1 / a;
  let term = sum;
  for (let n = 1; n < 500; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gammaContinuedFractionQ(a, x) {
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function regularizedGammaP(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  return x < a + 1 ? gammaSeriesP(a, x) : 1 - gammaContinuedFractionQ(a, x);
}

export function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  return clamp01(regularizedGammaP(df / 2, x / 2));
}

// Upper-tail critical value: smallest x with chiSquareCDF(x, df) >= 1 - alpha.
export function chiSquareCriticalValue(alpha, df) {
  let lo = 0, hi = df + 10;
  while (chiSquareCDF(hi, df) < 1 - alpha) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (chiSquareCDF(mid, df) < 1 - alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Noncentral chi-square CDF via a Poisson-weighted mixture of central
// chi-square CDFs — exact (to floating-point precision), not an approximation
// itself; what's approximate is using it to stand in for the noncentral F
// distribution in the ANOVA functions below.
export function noncentralChiSquareCDF(x, df, lambda) {
  if (!(lambda > 0)) return chiSquareCDF(x, df);
  const halfLambda = lambda / 2;
  let weight = Math.exp(-halfLambda);
  let cdf = weight * chiSquareCDF(x, df);
  for (let j = 1; j < 500; j++) {
    weight *= halfLambda / j;
    const term = weight * chiSquareCDF(x, df + 2 * j);
    cdf += term;
    if (weight < 1e-14 && term < 1e-14) break;
  }
  return clamp01(cdf);
}

function powerFromNoncentralChiSquare(df, lambda, alpha) {
  return 1 - noncentralChiSquareCDF(chiSquareCriticalValue(alpha, df), df, lambda);
}

// Smallest total N giving noncentral-chi-square power >= target, for a fixed
// df and an effect-size-driven noncentrality-per-N (exponential search then
// bisection — the power curve is monotonic increasing in N, so this always
// converges).
function searchTotalNForPower({ df, alpha, power, lambdaPerN }) {
  let n = 8;
  while (powerFromNoncentralChiSquare(df, lambdaPerN * n, alpha) < power && n < 1e7) n *= 2;
  let lo = Math.max(1, n / 2), hi = n;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (powerFromNoncentralChiSquare(df, lambdaPerN * mid, alpha) < power) lo = mid; else hi = mid;
  }
  return Math.ceil(hi);
}

// ---- Chi-square test of independence, e.g. a categorical outcome across
// groups (Cohen's w). Exact — the noncentral chi-square is this test's real
// alternative-hypothesis distribution, not a stand-in for something else. ----
export function sampleSizeChiSquare({ w, df, alpha = 0.05, power = 0.8 }) {
  if (!(w > 0) || !(df > 0)) return null;
  return searchTotalNForPower({ df, alpha, power, lambdaPerN: w * w });
}

export function achievedPowerChiSquare({ w, df, n, alpha = 0.05 }) {
  if (!(w > 0) || !(df > 0) || !(n > 0)) return null;
  return clamp01(powerFromNoncentralChiSquare(df, w * w * n, alpha));
}

export function minDetectableEffectChiSquare({ n, df, alpha = 0.05, power = 0.8 }) {
  if (!(n > 0) || !(df > 0)) return null;
  return solveEffectSizeForPower((w) => achievedPowerChiSquare({ w, df, n, alpha }), power, { lo: 1e-4, hi: 2 });
}

// ---- One-way ANOVA, k groups, continuous outcome (Cohen's f) ----
// Uses the noncentral chi-square (df = k-1) as an approximation to the
// noncentral F distribution — the standard fallback Cohen (1988) describes
// for planning without dedicated noncentral-F software. It's a reasonable
// estimate for 3+ groups; for exactly 2 groups, prefer sampleSizeTwoMeans
// above (the chi-square stand-in is weakest precisely where df1 = 1).
export function sampleSizePerGroupAnova({ f, groups, alpha = 0.05, power = 0.8 }) {
  if (!(f > 0) || !(groups >= 2)) return null;
  const totalN = searchTotalNForPower({ df: groups - 1, alpha, power, lambdaPerN: f * f });
  return Math.ceil(totalN / groups);
}

export function achievedPowerAnova({ f, groups, nPerGroup, alpha = 0.05 }) {
  if (!(f > 0) || !(groups >= 2) || !(nPerGroup > 0)) return null;
  return clamp01(powerFromNoncentralChiSquare(groups - 1, f * f * groups * nPerGroup, alpha));
}

export function minDetectableEffectAnova({ nPerGroup, groups, alpha = 0.05, power = 0.8 }) {
  if (!(nPerGroup > 0) || !(groups >= 2)) return null;
  return solveEffectSizeForPower((f) => achievedPowerAnova({ f, groups, nPerGroup, alpha }), power, { lo: 1e-4, hi: 2 });
}

// Labels a raw effect size as Cohen's small/medium/large when it's close
// (within 15%) to one of the named benchmarks; null otherwise (a genuinely
// custom value, not mislabeled as the nearest convention).
export function nearestCohenLabel(benchmarks, value) {
  if (!(value > 0)) return null;
  let best = null, bestDiff = Infinity;
  for (const [label, v] of Object.entries(benchmarks)) {
    const diff = Math.abs(v - value);
    if (diff < bestDiff) { bestDiff = diff; best = label; }
  }
  return best && bestDiff <= benchmarks[best] * 0.15 ? best : null;
}
