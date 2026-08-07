// utils-survey-analysis.js
//
// Pure computation engine for the Survey Participants "analysis hub" admin
// page. Everything here operates on a normalized survey definition (see
// utils-survey.js) plus raw survey_responses rows ({responses|response_json,
// experiment_group_id, submitted_at_iso, participant_id, session_id, ...})
// and has no knowledge of React or the backend — it's testable/composable in
// isolation from how the caller fetched the data.
//
// Auto-classification (demographic vs. measure, numeric vs. categorical,
// composite-scale detection) is heuristic, not admin-configured — there is
// no per-question "role" field in the survey schema today. Heuristics are
// deliberately conservative (keyword match on question id/text for
// demographics; numeric-choice-value detection for scored items) so they
// degrade gracefully to "just show it as a plain categorical/numeric item"
// rather than mis-filing something.

import { SURVEY_QUESTION_TYPES } from "./utils-survey";

/* =========================
   Basic descriptive stats
   ========================= */

export function mean(nums) {
  const arr = (nums || []).filter((v) => Number.isFinite(v));
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sampleVariance(nums) {
  const arr = (nums || []).filter((v) => Number.isFinite(v));
  if (arr.length < 2) return null;
  const m = mean(arr);
  const ss = arr.reduce((s, v) => s + (v - m) ** 2, 0);
  return ss / (arr.length - 1);
}

export function sampleStdDev(nums) {
  const v = sampleVariance(nums);
  return v == null ? null : Math.sqrt(v);
}

export function median(nums) {
  const arr = (nums || [])
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

export function summarizeNumeric(nums) {
  const arr = (nums || []).filter((v) => Number.isFinite(v));
  if (!arr.length) return { n: 0, mean: null, sd: null, median: null, min: null, max: null };
  return {
    n: arr.length,
    mean: mean(arr),
    sd: sampleStdDev(arr),
    median: median(arr),
    min: Math.min(...arr),
    max: Math.max(...arr),
  };
}

// A fixed 8-bin histogram looks broken (mostly-empty, "toothy") at the low N
// typical of early data collection — scale the bin count down instead of
// spreading a handful of points across 8 slots. `noVariation: true` lets
// callers render "no variation in responses yet" instead of a single
// full-width bar, which otherwise reads identically to a rendering bug.
export function histogramBins(nums, binCount = 8) {
  const clean = (nums || []).filter((v) => Number.isFinite(v));
  if (!clean.length) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (min === max) {
    return [{ x0: min, x1: max, count: clean.length, noVariation: true }];
  }
  const effectiveBinCount = Math.max(1, Math.min(binCount, clean.length - 1));
  const width = (max - min) / effectiveBinCount;
  const bins = Array.from({ length: effectiveBinCount }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  clean.forEach((v) => {
    let idx = Math.floor((v - min) / width);
    if (idx >= effectiveBinCount) idx = effectiveBinCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  });
  return bins;
}

/* =========================
   Numerical routines for p-values
   (Numerical-Recipes-style log-gamma / incomplete beta / incomplete gamma —
   standard, well-tested approximations; adequate for descriptive research
   use, not a substitute for dedicated stats software on borderline results.)
   ========================= */

function logGamma(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(x, a, b) {
  const MAXIT = 200;
  const EPS = 3e-9;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x, a, b) {
  if (!Number.isFinite(x) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(x, a, b)) / a;
  }
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

function gser(a, x) {
  const ITMAX = 200;
  const EPS = 3e-9;
  if (x <= 0) return 0;
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function gcf(a, x) {
  const ITMAX = 200;
  const EPS = 3e-9;
  const FPMIN = 1e-30;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function regularizedIncompleteGammaQ(a, x) {
  if (!Number.isFinite(a) || !Number.isFinite(x) || x < 0 || a <= 0) return null;
  if (x === 0) return 1;
  if (x < a + 1) return 1 - gser(a, x);
  return gcf(a, x);
}

export function studentTTwoTailedPValue(t, df) {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return null;
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

export function fDistPValue(F, df1, df2) {
  if (!Number.isFinite(F) || F < 0 || df1 <= 0 || df2 <= 0) return null;
  if (F === 0) return 1;
  const x = df2 / (df2 + df1 * F);
  return regularizedIncompleteBeta(x, df2 / 2, df1 / 2);
}

export function chiSquarePValue(chisq, df) {
  if (!Number.isFinite(chisq) || !Number.isFinite(df) || df <= 0) return null;
  return regularizedIncompleteGammaQ(df / 2, chisq / 2);
}

export function formatPValue(p) {
  if (p == null || !Number.isFinite(p)) return "—";
  if (p < 0.001) return "p < .001";
  return `p = ${p.toFixed(3).replace(/^0\./, ".")}`;
}

/* =========================
   Inferential tests
   ========================= */

export function welchTTest(a, b) {
  const na = (a || []).filter((v) => Number.isFinite(v));
  const nb = (b || []).filter((v) => Number.isFinite(v));
  if (na.length < 2 || nb.length < 2) return null;

  const ma = mean(na);
  const mb = mean(nb);
  const va = sampleVariance(na);
  const vb = sampleVariance(nb);
  const se2 = va / na.length + vb / nb.length;
  if (!(se2 > 0)) return null;

  const t = (ma - mb) / Math.sqrt(se2);
  const df =
    (se2 * se2) /
    ((va * va) / (na.length * na.length * (na.length - 1)) +
      (vb * vb) / (nb.length * nb.length * (nb.length - 1)));
  const p = studentTTwoTailedPValue(t, df);

  return {
    t,
    df,
    p,
    meanA: ma,
    meanB: mb,
    sdA: Math.sqrt(va),
    sdB: Math.sqrt(vb),
    nA: na.length,
    nB: nb.length,
    // Below this, the test is mathematically valid but not a meaningful
    // estimate — a soft caveat flag, not a hard cutoff (a researcher
    // watching a pilot trickle in may still want to see where things stand).
    lowN: na.length < 10 || nb.length < 10,
  };
}

export function oneWayAnova(groups) {
  const cleanGroups = (groups || []).map((g) => (g || []).filter((v) => Number.isFinite(v)));
  const k = cleanGroups.length;
  const all = cleanGroups.flat();
  const N = all.length;
  if (k < 2 || N <= k) return null;

  const grandMean = mean(all);
  let ssBetween = 0;
  let ssWithin = 0;

  const groupStats = cleanGroups.map((g) => {
    const n = g.length;
    const m = n ? mean(g) : null;
    if (n && m != null) ssBetween += n * (m - grandMean) ** 2;
    if (n) ssWithin += g.reduce((s, v) => s + (v - m) ** 2, 0);
    return { n, mean: m, sd: n >= 2 ? sampleStdDev(g) : null };
  });

  const dfBetween = k - 1;
  const dfWithin = N - k;
  if (dfWithin <= 0) return { groupStats, F: null, p: null, dfBetween, dfWithin };

  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const F = msWithin > 0 ? msBetween / msWithin : null;
  const p = F != null ? fDistPValue(F, dfBetween, dfWithin) : null;

  const lowN = N < 10 || groupStats.some((g) => g.n < 3);
  return { groupStats, F, p, dfBetween, dfWithin, lowN };
}

export function chiSquareTest(table) {
  const rows = (table || []).length;
  const cols = table?.[0]?.length || 0;
  if (rows < 2 || cols < 2) return null;

  const rowTotals = table.map((r) => r.reduce((a, b) => a + b, 0));
  const colTotals = Array.from({ length: cols }, (_, j) => table.reduce((s, r) => s + r[j], 0));
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);
  if (!grandTotal) return null;

  let chisq = 0;
  // Standard chi-square validity rule of thumb: the test isn't reliable when
  // any cell's expected count falls below 5 (Cochran's rule) — very common
  // with small-N/many-category cross-tabs early in data collection. We still
  // compute the statistic (a researcher may want to see it), but flag it so
  // the UI can show a caveat instead of presenting the p-value with full
  // confidence.
  let minExpected = Infinity;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const expected = (rowTotals[i] * colTotals[j]) / grandTotal;
      if (expected < minExpected) minExpected = expected;
      if (expected > 0) chisq += (table[i][j] - expected) ** 2 / expected;
    }
  }

  const df = (rows - 1) * (cols - 1);
  if (df <= 0) return null;
  const p = chiSquarePValue(chisq, df);

  return { chisq, df, p, n: grandTotal, lowExpectedCounts: minExpected < 5 };
}

export function cronbachAlpha(itemMatrix) {
  const complete = (itemMatrix || []).filter((row) => row.every((v) => Number.isFinite(v)));
  const n = complete.length;
  const k = complete[0]?.length || 0;
  if (n < 2 || k < 2) return null;

  const itemVariances = [];
  for (let j = 0; j < k; j++) {
    itemVariances.push(sampleVariance(complete.map((row) => row[j])));
  }

  const totals = complete.map((row) => row.reduce((a, b) => a + b, 0));
  const totalVariance = sampleVariance(totals);
  if (!(totalVariance > 0)) return null;

  const sumItemVar = itemVariances.reduce((a, b) => a + b, 0);
  const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVariance);

  // n>=2 is the mathematical minimum, but an alpha computed off a handful of
  // respondents is not a meaningful reliability estimate (can even come out
  // negative) — flag rather than hide, same reasoning as welchTTest/oneWayAnova.
  return { alpha, n, k, lowN: n < 10 };
}

/* =========================
   Question classification
   ========================= */

const DEMOGRAPHIC_PATTERNS = [
  { key: "age", re: /\bage\b/i },
  { key: "gender", re: /\b(gender|sex)\b/i },
  { key: "income", re: /\b(income|salary|earnings?)\b/i },
  { key: "education", re: /\b(education|degree|qualification)/i },
  { key: "ethnicity", re: /\b(ethnicit|race)/i },
  { key: "employment", re: /\b(employ|occupation)/i },
  { key: "marital", re: /\b(marital|relationship\s*status)/i },
  { key: "nationality", re: /\b(nationality|citizenship|country)\b/i },
  { key: "residence", re: /\b(resid|location|state|province)\b/i },
  { key: "language", re: /\b(native\s*language|first\s*language)\b/i },
];

function detectDemographicKind(idAndText) {
  for (const pattern of DEMOGRAPHIC_PATTERNS) {
    if (pattern.re.test(idAndText)) return pattern.key;
  }
  return null;
}

/**
 * Question text comes straight out of the rich-text editor (normalizeRichTextHtml
 * in the survey editor), e.g. "<p><b>What is your age?</b></p>" — fine for
 * rendering the real question, but this analysis hub only ever shows question
 * text as a compact label/chart title, so it needs to be plain text.
 */
function stripHtmlToText(html) {
  const s = String(html ?? "");
  if (!s) return "";
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = s;
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
  }
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function choicesAreNumeric(choices) {
  const vals = (choices || [])
    .map((c) => c?.value)
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "");
  if (vals.length < 2) return false;
  return vals.every((v) => Number.isFinite(Number(v)));
}

/**
 * Flattens a survey definition's questions into "answerable items" — one per
 * standalone question, or one per row for matrix/bipolar questions (each row
 * is its own scored item, e.g. a "BL" matrix question with rows BL_1/BL_2/
 * BL_3 produces three items sharing compositeQuestionId "BL").
 */
export function classifySurveyQuestions(survey) {
  const pages = Array.isArray(survey?.pages) ? survey.pages : [];
  const out = [];

  pages.forEach((page, pageIndex) => {
    const questions = Array.isArray(page?.questions) ? page.questions : [];
    questions.forEach((q, qIndex) => {
      const type = q?.type;
      if (
        !q?.id ||
        type === SURVEY_QUESTION_TYPES.INFO ||
        type === SURVEY_QUESTION_TYPES.POST_REMINDER ||
        type === SURVEY_QUESTION_TYPES.PAGE_BREAK
      ) {
        return;
      }

      const plainText = stripHtmlToText(q.text) || q.id;
      const demographicKind = detectDemographicKind(`${q.id} ${plainText}`);
      const isDemographic = !!demographicKind;

      const pushItem = (extra) =>
        out.push({
          questionId: q.id,
          questionText: plainText,
          questionType: type,
          pageIndex,
          qIndex,
          isDemographic,
          demographicKind,
          isComposite: false,
          compositeQuestionId: null,
          ...extra,
        });

      switch (type) {
        case SURVEY_QUESTION_TYPES.SLIDER:
          pushItem({
            itemKey: q.id,
            itemLabel: plainText,
            kind: "numeric",
            min: q.min,
            max: q.max,
          });
          break;

        case SURVEY_QUESTION_TYPES.BIPOLAR: {
          // Choice-coded values (1..5, etc.) are a meaningful ordinal scale
          // for genuine measure items (Likert-style), but for a demographic
          // question they're just category codes (e.g. gender 1/2/3) —
          // averaging them would be meaningless, so demographics always stay
          // categorical regardless of what the underlying codes look like.
          const numeric = !isDemographic && choicesAreNumeric(q.columns);
          (q.rows || []).forEach((row) => {
            pushItem({
              itemKey: row.value,
              itemLabel: row.label || row.left_label || row.value,
              kind: numeric ? "numeric" : "categorical",
              choices: q.columns,
              isComposite: true,
              compositeQuestionId: q.id,
              isAttentionCheck: !!row.is_attention_check,
              attentionCheckValue: String(row.attention_check_value || ""),
            });
          });
          break;
        }

        case SURVEY_QUESTION_TYPES.MATRIX_SINGLE: {
          const numeric = !isDemographic && choicesAreNumeric(q.columns);
          (q.rows || []).forEach((row) => {
            pushItem({
              itemKey: row.value,
              itemLabel: row.label || row.value,
              kind: numeric ? "numeric" : "categorical",
              choices: q.columns,
              isComposite: true,
              compositeQuestionId: q.id,
              isAttentionCheck: !!row.is_attention_check,
              attentionCheckValue: String(row.attention_check_value || ""),
            });
          });
          break;
        }

        case SURVEY_QUESTION_TYPES.MATRIX_MULTI: {
          (q.rows || []).forEach((row) => {
            pushItem({
              itemKey: row.value,
              itemLabel: row.label || row.value,
              kind: "multi",
              choices: q.columns,
              isComposite: true,
              compositeQuestionId: q.id,
            });
          });
          break;
        }

        case SURVEY_QUESTION_TYPES.SINGLE:
        case SURVEY_QUESTION_TYPES.DROPDOWN: {
          const numeric = !isDemographic && choicesAreNumeric(q.choices);
          pushItem({
            itemKey: q.id,
            itemLabel: plainText,
            kind: numeric ? "numeric" : "categorical",
            choices: q.choices,
            isAttentionCheck: !!q.is_attention_check,
            attentionCheckValue: String(q.attention_check_value || ""),
          });
          break;
        }

        case SURVEY_QUESTION_TYPES.MULTI:
          pushItem({
            itemKey: q.id,
            itemLabel: plainText,
            kind: "multi",
            choices: q.choices,
          });
          break;

        case SURVEY_QUESTION_TYPES.TEXT:
        case SURVEY_QUESTION_TYPES.TEXTAREA:
          pushItem({ itemKey: q.id, itemLabel: plainText, kind: "text" });
          break;

        default:
          break;
      }
    });
  });

  return out;
}

/**
 * Groups classified items into composite (multi-item) scales:
 *  1. Matrix/bipolar questions with numeric columns — one composite per
 *     question, items = its rows (e.g. question id "BL" -> rows BL_1/BL_2/BL_3).
 *  2. Standalone numeric questions whose ids share a "<PREFIX>_<N>" pattern
 *     (e.g. three separate slider questions BL_1, BL_2, BL_3) — grouped by
 *     PREFIX when at least two items share it.
 * Demographic items are never grouped into composites.
 */
export function buildComposites(items) {
  const composites = [];
  const byQuestion = new Map();

  items.forEach((it) => {
    if (!it.isComposite) return;
    if (!byQuestion.has(it.compositeQuestionId)) byQuestion.set(it.compositeQuestionId, []);
    byQuestion.get(it.compositeQuestionId).push(it);
  });

  byQuestion.forEach((groupItems, questionId) => {
    // An attention-check row isn't a real measurement item — folding it into
    // the composite's mean/Cronbach's alpha would contaminate both with a
    // row that's answered by instruction, not by the trait the scale
    // measures. Excluded here, not hidden — it still shows up as its own
    // standalone item below (never absorbed into a composite, so
    // computeMeasuresSummary's standalone filter picks it up automatically).
    const numericItems = groupItems.filter(
      (it) => it.kind === "numeric" && !it.isDemographic && !it.isAttentionCheck
    );
    if (numericItems.length >= 2) {
      composites.push({
        id: questionId,
        label: numericItems[0].questionText || questionId,
        source: "matrix",
        items: numericItems,
      });
    }
  });

  const standaloneNumeric = items.filter(
    (it) => !it.isComposite && it.kind === "numeric" && !it.isDemographic
  );
  const byPrefix = new Map();
  standaloneNumeric.forEach((it) => {
    const m = String(it.questionId).match(/^(.+?)_(\d+)$/);
    if (!m || !m[1]) return;
    const prefix = m[1];
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(it);
  });

  byPrefix.forEach((groupItems, prefix) => {
    if (groupItems.length < 2) return;
    if (byQuestion.has(prefix)) return; // avoid colliding with a real question id
    const sorted = [...groupItems].sort((a, b) =>
      a.questionId.localeCompare(b.questionId, undefined, { numeric: true })
    );
    composites.push({ id: prefix, label: prefix, source: "prefix_group", items: sorted });
  });

  return composites;
}

function absorbedItemKeySet(composites) {
  const set = new Set();
  composites.forEach((c) => c.items.forEach((it) => set.add(`${it.questionId}::${it.itemKey}`)));
  return set;
}

/* =========================
   Custom (tag-based) measure groups
   ========================= */

export function itemRefKey(it) {
  return `${it.questionId}::${it.itemKey}`;
}

/**
 * Every underscore/non-alphanumeric-delimited token that identifies this item
 * — e.g. a raw item "MI3_EMO_BL_1" (whether that's the questionId itself, or
 * a matrix row value under a compositeQuestionId) tokenizes to
 * ["MI3","EMO","BL","1"]. Pulls tokens from questionId, compositeQuestionId,
 * and itemKey together (deduped) so it doesn't matter which field actually
 * carries the naming convention.
 */
export function tokenizeItemId(it) {
  const parts = [it?.questionId, it?.compositeQuestionId, it?.itemKey]
    .filter((v) => v != null)
    .map(String);
  const tokens = parts.join("_").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  return Array.from(new Set(tokens));
}

function tokenMatches(token, patternToken) {
  if (patternToken.includes("*")) {
    const re = new RegExp(
      "^" + patternToken.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$"
    );
    return re.test(token);
  }
  // Bare tokens (no "*") prefix-match rather than requiring exact equality —
  // naming conventions like "MI1_EMO_BL_1" fuse the post index straight onto
  // the tag with no delimiter, so a token never literally equals "MI" on its
  // own; typing "MI" should still mean "MI1, MI2, MI3, ...". This stays
  // token-boundary-safe (matching happens per split token, not as a raw
  // substring of the whole id) so "EMO" still never matches "NOEMO".
  return token.startsWith(patternToken);
}

/**
 * Tag-query language for grouping items across a whole survey's naming
 * convention (e.g. "MI EMO BL" -> every item whose id tokenizes to include
 * MI*, EMO, and BL all at once). Space-separated tokens are AND'd together;
 * comma-separated clauses are OR'd; "*" wildcards within a token. Matching is
 * against whole tokens (not substrings), so "EMO" never accidentally matches
 * "NOEMO" — they're different tokens once split on "_".
 */
export function matchesTagPattern(tokens, pattern) {
  const clauses = String(pattern || "")
    .toUpperCase()
    .split(",")
    .map((c) => c.trim().split(/\s+/).filter(Boolean))
    .filter((c) => c.length);
  if (!clauses.length) return false;
  return clauses.some((andTokens) =>
    andTokens.every((pt) => tokens.some((t) => tokenMatches(t, pt)))
  );
}

/**
 * Numeric, non-demographic items eligible to go into a custom group — the
 * same universe the auto-detected composites/standalone-numeric list draws
 * from, just not pre-grouped.
 */
export function getGroupableItems(dataset) {
  return (dataset?.items || []).filter((it) => it.kind === "numeric" && !it.isDemographic);
}

export function findItemsMatchingTagPattern(dataset, pattern) {
  if (!String(pattern || "").trim()) return [];
  return getGroupableItems(dataset).filter((it) => matchesTagPattern(tokenizeItemId(it), pattern));
}

/** Builds a composite-shaped object (same shape buildComposites produces) from an explicit item-ref list, so summarizeComposite/computeCompositeScores work unchanged on custom groups. */
export function buildCustomGroupComposite(groupDef, dataset) {
  const byKey = new Map((dataset?.items || []).map((it) => [itemRefKey(it), it]));
  const items = (groupDef?.itemKeys || []).map((k) => byKey.get(k)).filter(Boolean);
  return { id: groupDef.id, label: groupDef.name || groupDef.id, source: "custom", items };
}

/* =========================
   Reading answers out of a response row
   ========================= */

export function coerceResponses(row) {
  const raw = row?.responses ?? row?.response_json ?? {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function getRawItemValue(responses, item) {
  if (!responses || typeof responses !== "object") return undefined;
  if (item.isComposite) {
    const obj = responses[item.compositeQuestionId];
    if (!obj || typeof obj !== "object") return undefined;
    return obj[item.itemKey];
  }
  return responses[item.questionId];
}

function parseNumericOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function makeChoiceLabelLookup(choices) {
  const map = new Map(
    (choices || []).map((c) => [String(c?.value ?? "").trim(), String(c?.label ?? c?.value ?? "").trim()])
  );
  return (rawValue) => map.get(String(rawValue).trim()) || String(rawValue);
}

/* =========================
   Dataset assembly
   ========================= */

export function buildAnalysisDataset({ survey, responseRows }) {
  const items = classifySurveyQuestions(survey);
  const composites = buildComposites(items);
  const absorbed = absorbedItemKeySet(composites);

  const rows = (responseRows || []).map((row) => ({
    session_id: row?.session_id || "",
    participant_id: row?.participant_id || "",
    submitted_at_iso: row?.submitted_at_iso || "",
    experiment_group_id: row?.experiment_group_id ? String(row.experiment_group_id) : "",
    responses: coerceResponses(row),
  }));

  return { items, composites, absorbed, rows };
}

/* =========================
   Per-item / per-composite summaries
   ========================= */

export function summarizeItem(item, rows) {
  const raws = (rows || []).map((r) => getRawItemValue(r.responses, item));

  if (item.kind === "numeric") {
    const nums = raws.map((v) => parseNumericOrNull(v)).filter((v) => v != null);
    return { kind: "numeric", ...summarizeNumeric(nums), nAnswered: nums.length, nTotal: raws.length };
  }

  if (item.kind === "categorical") {
    const labelFor = makeChoiceLabelLookup(item.choices);
    const counts = new Map();
    let answered = 0;
    raws.forEach((v) => {
      const s = v == null ? "" : String(v).trim();
      if (!s) return;
      answered += 1;
      const label = labelFor(s);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    const options = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, pct: answered ? count / answered : 0 }))
      .sort((a, b) => b.count - a.count);
    return { kind: "categorical", options, nAnswered: answered, nTotal: raws.length };
  }

  if (item.kind === "multi") {
    const labelFor = makeChoiceLabelLookup(item.choices);
    const counts = new Map();
    let answered = 0;
    raws.forEach((v) => {
      const arr = Array.isArray(v) ? v : [];
      if (!arr.length) return;
      answered += 1;
      arr.forEach((opt) => {
        const s = String(opt ?? "").trim();
        if (!s) return;
        const label = labelFor(s);
        counts.set(label, (counts.get(label) || 0) + 1);
      });
    });
    const options = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count, pct: answered ? count / answered : 0 }))
      .sort((a, b) => b.count - a.count);
    return { kind: "multi", options, nAnswered: answered, nTotal: raws.length };
  }

  const answered = raws.filter((v) => String(v ?? "").trim()).length;
  return { kind: "text", nAnswered: answered, nTotal: raws.length };
}

export function computeCompositeScores(composite, rows) {
  return (rows || []).map((r) => {
    const vals = composite.items
      .map((it) => parseNumericOrNull(getRawItemValue(r.responses, it)))
      .filter((v) => v != null);
    if (!vals.length) return null;
    return mean(vals);
  });
}

export function summarizeComposite(composite, rows) {
  const scores = computeCompositeScores(composite, rows).filter((v) => v != null);
  const summary = summarizeNumeric(scores);

  const itemMatrix = (rows || [])
    .map((r) => composite.items.map((it) => parseNumericOrNull(getRawItemValue(r.responses, it))))
    .filter((row) => row.every((v) => v != null));
  const reliability = itemMatrix.length >= 2 ? cronbachAlpha(itemMatrix) : null;

  return {
    kind: "composite",
    ...summary,
    nAnswered: scores.length,
    nTotal: (rows || []).length,
    nItems: composite.items.length,
    reliability,
  };
}

/* =========================
   Top-level report builders
   ========================= */

export function computeDemographicsSummary(dataset) {
  const demoItems = dataset.items.filter((it) => it.isDemographic);
  return demoItems.map((item) => ({ item, summary: summarizeItem(item, dataset.rows) }));
}

export function computeMeasuresSummary(dataset) {
  const composites = dataset.composites.map((composite) => ({
    composite,
    summary: summarizeComposite(composite, dataset.rows),
  }));

  const standalone = dataset.items.filter(
    (it) =>
      !it.isDemographic &&
      !dataset.absorbed.has(`${it.questionId}::${it.itemKey}`)
  );

  const standaloneNumeric = standalone
    .filter((it) => it.kind === "numeric")
    .map((item) => ({ item, summary: summarizeItem(item, dataset.rows) }));

  const standaloneCategorical = standalone
    .filter((it) => it.kind === "categorical" || it.kind === "multi")
    .map((item) => ({ item, summary: summarizeItem(item, dataset.rows) }));

  const textItems = standalone
    .filter((it) => it.kind === "text")
    .map((item) => ({ item, summary: summarizeItem(item, dataset.rows) }));

  return { composites, standaloneNumeric, standaloneCategorical, textItems };
}

export function computeGroupComparison(dataset, experimentGroups, customGroupComposites = []) {
  const groups = Array.isArray(experimentGroups) ? experimentGroups : [];
  if (groups.length < 2) return null;

  const rowsByGroup = new Map(groups.map((g) => [g.id, []]));
  dataset.rows.forEach((r) => {
    const gid = r.experiment_group_id;
    if (rowsByGroup.has(gid)) rowsByGroup.get(gid).push(r);
  });

  const numericTargets = [
    ...(customGroupComposites || []).map((c) => ({
      key: `custom:${c.id}`,
      label: c.label,
      get: (rws) => computeCompositeScores(c, rws).filter((v) => v != null),
    })),
    ...dataset.composites.map((c) => ({
      key: `composite:${c.id}`,
      label: c.label,
      get: (rws) => computeCompositeScores(c, rws).filter((v) => v != null),
    })),
    ...dataset.items
      .filter((it) => it.kind === "numeric" && !it.isDemographic && !dataset.absorbed.has(`${it.questionId}::${it.itemKey}`))
      .map((it) => ({
        key: `item:${it.questionId}`,
        label: it.itemLabel,
        get: (rws) => rws.map((r) => parseNumericOrNull(getRawItemValue(r.responses, it))).filter((v) => v != null),
      })),
  ];

  const numericComparisons = numericTargets.map((target) => {
    const perGroupVals = groups.map((g) => target.get(rowsByGroup.get(g.id) || []));
    const perGroup = groups.map((g, i) => ({
      groupId: g.id,
      groupName: g.name,
      ...summarizeNumeric(perGroupVals[i]),
    }));

    let test = null;
    if (groups.length === 2) {
      const t = welchTTest(perGroupVals[0], perGroupVals[1]);
      test = t ? { type: "welch_t", ...t } : null;
    } else {
      const anova = oneWayAnova(perGroupVals);
      test = anova ? { type: "anova", ...anova } : null;
    }

    return { key: target.key, label: target.label, perGroup, test };
  });

  const categoricalTargets = dataset.items.filter(
    (it) => it.kind === "categorical" || it.kind === "multi"
  );

  const categoricalComparisons = categoricalTargets.map((it) => {
    const perGroupSummary = groups.map((g) => summarizeItem(it, rowsByGroup.get(g.id) || []));
    const labelSet = new Set();
    perGroupSummary.forEach((s) => s.options.forEach((o) => labelSet.add(o.label)));
    const labels = Array.from(labelSet);
    const table = perGroupSummary.map((s) => {
      const byLabel = new Map(s.options.map((o) => [o.label, o.count]));
      return labels.map((l) => byLabel.get(l) || 0);
    });
    const test = labels.length >= 2 ? chiSquareTest(table) : null;

    return {
      key: `item:${it.questionId}:${it.itemKey}`,
      label: it.itemLabel,
      questionText: it.questionText,
      perGroup: groups.map((g, i) => ({ groupId: g.id, groupName: g.name, ...perGroupSummary[i] })),
      test: test ? { type: "chi_square", ...test } : null,
    };
  });

  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name, n: (rowsByGroup.get(g.id) || []).length })),
    numericComparisons,
    categoricalComparisons,
  };
}
