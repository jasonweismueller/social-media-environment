/// components-admin-power-analysis.jsx
//
// A comprehensive power-analysis tool (a-priori sample size / post-hoc
// achieved power / sensitivity-to-minimum-detectable-effect), across five
// test families relevant to this app's between-subjects experiment-group
// studies: two independent groups, paired/pre-post, one-way ANOVA (3+
// groups), a categorical/chi-square outcome, and correlation between two
// measures. All math lives in utils-power-analysis.js — this file is
// presentation + a small effect-size-from-raw-data convenience layer, plus a
// hoverable power-vs-N curve.
//
// One thing generic tools like G*Power can't do: when opened from a survey
// that already has real (or simulated) response data, it can compute the
// *observed* effect size directly from that data (group means/SDs, or an
// already-run chi-square test) instead of requiring the researcher to type
// one in from memory.
import React, { useMemo, useRef, useState, useEffect } from "react";
import { Modal, Tabs, Button, Badge, Table, Th, Td, Tr } from "./ui";
import {
  COHEN_D,
  COHEN_DZ,
  COHEN_F,
  COHEN_F2,
  COHEN_W,
  COHEN_R,
  sampleSizeTwoMeans,
  achievedPowerTwoMeans,
  minDetectableEffectTwoMeans,
  sampleSizePairedMeans,
  achievedPowerPairedMeans,
  minDetectableEffectPairedMeans,
  sampleSizePerGroupAnova,
  achievedPowerAnova,
  minDetectableEffectAnova,
  sampleSizeFactorialInteraction,
  achievedPowerFactorialInteraction,
  minDetectableEffectFactorialInteraction,
  sampleSizeRegressionInteraction,
  achievedPowerRegressionInteraction,
  minDetectableEffectRegressionInteraction,
  sampleSizeChiSquare,
  achievedPowerChiSquare,
  minDetectableEffectChiSquare,
  sampleSizeCorrelation,
  achievedPowerCorrelation,
  minDetectableEffectCorrelation,
  cohensDFromMeans,
  cohensFFromGroups,
  cohensWFromChiSquare,
  nearestCohenLabel,
} from "../utils";

const ANALYSIS_TYPES = [
  { id: "apriori", label: "Required sample size", summary: "solve for N" },
  { id: "posthoc", label: "Achieved power", summary: "solve for power" },
  { id: "sensitivity", label: "Minimum detectable effect", summary: "solve for effect size" },
];

const FAMILIES = [
  { id: "means", label: "2 groups, numeric outcome (t-test)", benchmarks: COHEN_D, effectLabel: "Cohen's d", hasTails: true, unit: "per group" },
  { id: "paired", label: "Paired / pre-post comparison (t-test)", benchmarks: COHEN_DZ, effectLabel: "Cohen's dz", hasTails: true, unit: "participants" },
  { id: "anova", label: "3+ groups, numeric outcome (ANOVA)", benchmarks: COHEN_F, effectLabel: "Cohen's f", hasTails: false, unit: "per group" },
  {
    id: "anova2way",
    label: "2-way interaction, numeric outcome (factorial ANOVA)",
    benchmarks: COHEN_F,
    effectLabel: "Cohen's f",
    hasTails: false,
    unit: "per cell",
  },
  {
    id: "modreg",
    label: "Interaction with a continuous moderator (moderated regression)",
    benchmarks: COHEN_F2,
    effectLabel: "Cohen's f²",
    hasTails: false,
    unit: "total",
  },
  { id: "chisq", label: "Categorical outcome (chi-square)", benchmarks: COHEN_W, effectLabel: "Cohen's w", hasTails: false, unit: "total" },
  { id: "correlation", label: "Correlation between two measures", benchmarks: COHEN_R, effectLabel: "Pearson's r", hasTails: true, unit: "pairs" },
];

const FAMILY_NOTES = {
  means:
    "Uses Cohen's (1988) normal-approximation formula, the standard method for a-priori planning — the real analysis this app runs (Welch's t-test) is exact and may need a participant or two fewer or more.",
  paired:
    "Same normal-approximation method as the two-group case, applied to the one column of difference scores a paired/pre-post design produces.",
  anova:
    "Uses the noncentral-chi-square approximation to the F-distribution (Cohen, 1988) — a reasonable planning estimate for 3+ groups, not an exact figure. For exactly 2 groups, use the t-test option instead.",
  anova2way:
    "Tests the interaction term only — e.g. your 5 conditions × a categorical individual-differences variable like political party (or ideology split into groups). Uses an exact noncentral-F test (more precise than the one-way ANOVA option above), assuming a balanced design with equal n per cell. Interactions typically need noticeably more N than a main effect of the same nominal size — don't be surprised if this asks for a lot more participants than the one-way option would.",
  modreg:
    "For a continuous moderator (e.g. a political-ideology scale) rather than grouping it — tests whether adding the condition × moderator interaction term(s) to a model that already includes both main effects explains additional variance, via Cohen's f² for the added R² (Cohen, 1988, ch. 9). Generally preferable to binning a continuous moderator into groups just to run the factorial-ANOVA option instead, since binning throws away real information.",
  chisq:
    "Exact, from the noncentral chi-square distribution — the same test the Group comparison section uses for categorical outcomes.",
  correlation:
    "Uses Cohen's (1988) Fisher-z approximation, the standard method for a-priori planning around a correlation coefficient.",
};

const labelStyle = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--admin-muted)" };
const fieldInputStyle = { padding: "6px 9px", borderRadius: 6, border: "1px solid var(--admin-border)", fontSize: 13, background: "var(--admin-surface)", color: "var(--admin-text)" };
const pillStyle = { padding: "5px 10px", borderRadius: 999, border: "1px solid var(--admin-border)", background: "var(--admin-surface)", color: "var(--admin-text)", fontSize: 12, cursor: "pointer" };
const pillActiveStyle = { borderColor: "var(--admin-accent-border)", background: "var(--admin-accent-soft)", color: "var(--admin-accent-ink)", fontWeight: 600 };

function computeDfForChisq(groups, categories) {
  return Math.max(1, (Math.max(2, Number(groups) || 2) - 1) * (Math.max(2, Number(categories) || 2) - 1));
}

function computeResult(familyId, analysisType, p) {
  const { effectSize, alpha, power, n, tails, groups, categories, levelsA, levelsB, interactionDf, totalPredictors } = p;
  const df = familyId === "chisq" ? computeDfForChisq(groups, categories) : null;
  const g = Math.max(2, Number(groups) || 2);

  if (familyId === "means") {
    if (analysisType === "apriori") {
      const v = sampleSizeTwoMeans({ d: effectSize, alpha, power, tails });
      return v == null ? null : { value: v, total: v * 2 };
    }
    if (analysisType === "posthoc") return wrap(achievedPowerTwoMeans({ d: effectSize, n, alpha, tails }));
    return wrap(minDetectableEffectTwoMeans({ n, alpha, power, tails }));
  }
  if (familyId === "paired") {
    if (analysisType === "apriori") return wrap(sampleSizePairedMeans({ dz: effectSize, alpha, power, tails }));
    if (analysisType === "posthoc") return wrap(achievedPowerPairedMeans({ dz: effectSize, n, alpha, tails }));
    return wrap(minDetectableEffectPairedMeans({ n, alpha, power, tails }));
  }
  if (familyId === "anova") {
    if (analysisType === "apriori") {
      const v = sampleSizePerGroupAnova({ f: effectSize, groups: g, alpha, power });
      return v == null ? null : { value: v, total: v * g };
    }
    if (analysisType === "posthoc") return wrap(achievedPowerAnova({ f: effectSize, groups: g, nPerGroup: n, alpha }));
    return wrap(minDetectableEffectAnova({ nPerGroup: n, groups: g, alpha, power }));
  }
  if (familyId === "anova2way") {
    if (analysisType === "apriori") {
      const v = sampleSizeFactorialInteraction({ f: effectSize, levelsA, levelsB, alpha, power });
      return v == null ? null : { value: v.perCell, total: v.total, df1: v.df1, cells: v.cells };
    }
    if (analysisType === "posthoc") return wrap(achievedPowerFactorialInteraction({ f: effectSize, levelsA, levelsB, nPerCell: n, alpha }));
    return wrap(minDetectableEffectFactorialInteraction({ levelsA, levelsB, nPerCell: n, alpha, power }));
  }
  if (familyId === "modreg") {
    if (analysisType === "apriori") {
      const v = sampleSizeRegressionInteraction({ f2: effectSize, interactionDf, totalPredictors, alpha, power });
      return v == null ? null : { value: v.total, total: v.total, df1: v.df1 };
    }
    if (analysisType === "posthoc") return wrap(achievedPowerRegressionInteraction({ f2: effectSize, interactionDf, totalPredictors, n, alpha }));
    return wrap(minDetectableEffectRegressionInteraction({ interactionDf, totalPredictors, n, alpha, power }));
  }
  if (familyId === "chisq") {
    if (analysisType === "apriori") return wrap(sampleSizeChiSquare({ w: effectSize, df, alpha, power }));
    if (analysisType === "posthoc") return wrap(achievedPowerChiSquare({ w: effectSize, df, n, alpha }));
    return wrap(minDetectableEffectChiSquare({ n, df, alpha, power }));
  }
  if (familyId === "correlation") {
    if (analysisType === "apriori") return wrap(sampleSizeCorrelation({ r: effectSize, alpha, power, tails }));
    if (analysisType === "posthoc") return wrap(achievedPowerCorrelation({ r: effectSize, n, alpha, tails }));
    return wrap(minDetectableEffectCorrelation({ n, alpha, power, tails }));
  }
  return null;
}

function wrap(v) {
  return v == null ? null : { value: v };
}

// Power at an arbitrary N, holding effect size/alpha/tails/groups fixed —
// what the curve plots, independent of which analysis mode is selected.
function powerAt(familyId, p, nAtPoint) {
  const { effectSize, alpha, tails, groups, categories, levelsA, levelsB, interactionDf, totalPredictors } = p;
  const df = familyId === "chisq" ? computeDfForChisq(groups, categories) : null;
  const g = Math.max(2, Number(groups) || 2);
  if (familyId === "means") return achievedPowerTwoMeans({ d: effectSize, n: nAtPoint, alpha, tails });
  if (familyId === "paired") return achievedPowerPairedMeans({ dz: effectSize, n: nAtPoint, alpha, tails });
  if (familyId === "anova") return achievedPowerAnova({ f: effectSize, groups: g, nPerGroup: nAtPoint, alpha });
  if (familyId === "anova2way") return achievedPowerFactorialInteraction({ f: effectSize, levelsA, levelsB, nPerCell: nAtPoint, alpha });
  if (familyId === "modreg") return achievedPowerRegressionInteraction({ f2: effectSize, interactionDf, totalPredictors, n: nAtPoint, alpha });
  if (familyId === "chisq") return achievedPowerChiSquare({ w: effectSize, df, n: nAtPoint, alpha });
  if (familyId === "correlation") return achievedPowerCorrelation({ r: effectSize, n: nAtPoint, alpha, tails });
  return null;
}

function PowerCurveChart({ computePower, nMin, nMax, targetPower, highlightN, xLabel }) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 640, H = 200;
  const M = { l: 46, r: 16, t: 12, b: 28 };
  const plotW = W - M.l - M.r, plotH = H - M.t - M.b;

  const points = useMemo(() => {
    const pts = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const n = nMin + ((nMax - nMin) * i) / steps;
      const p = computePower(n);
      pts.push({ n, p: p == null ? 0 : p });
    }
    return pts;
  }, [computePower, nMin, nMax]);

  const xFor = (n) => M.l + ((n - nMin) / (nMax - nMin || 1)) * plotW;
  const yFor = (p) => M.t + (1 - Math.max(0, Math.min(1, p))) * plotH;

  const pathD = points.map((pt, i) => `${i === 0 ? "M" : "L"}${xFor(pt.n).toFixed(1)},${yFor(pt.p).toFixed(1)}`).join(" ");
  const areaD = `${pathD} L${xFor(points[points.length - 1].n).toFixed(1)},${(M.t + plotH).toFixed(1)} L${xFor(points[0].n).toFixed(1)},${(M.t + plotH).toFixed(1)} Z`;
  const highlightPower = computePower(highlightN);
  const gridSteps = [0, 0.2, 0.4, 0.6, 0.8, 1];

  const handleMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const n = nMin + ((px - M.l) / plotW) * (nMax - nMin);
    if (n < nMin || n > nMax) {
      setHover(null);
      return;
    }
    const p = computePower(n);
    setHover({ n: Math.round(n), power: p, x: xFor(n), y: yFor(p == null ? 0 : p) });
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {gridSteps.map((g) => (
          <g key={g}>
            <line x1={M.l} x2={W - M.r} y1={yFor(g)} y2={yFor(g)} stroke="var(--admin-border-subtle)" strokeWidth={1} />
            <text x={M.l - 8} y={yFor(g) + 3} textAnchor="end" fontSize={10} fill="var(--admin-muted)">
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}
        <line
          x1={M.l}
          x2={W - M.r}
          y1={yFor(targetPower)}
          y2={yFor(targetPower)}
          stroke="var(--admin-muted-2)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        <text x={W - M.r} y={yFor(targetPower) - 5} textAnchor="end" fontSize={10} fill="var(--admin-muted-2)">
          target {Math.round(targetPower * 100)}%
        </text>

        <path d={areaD} fill="var(--admin-chart-1)" opacity={0.12} stroke="none" />
        <path d={pathD} fill="none" stroke="var(--admin-chart-1)" strokeWidth={2} />

        {highlightPower != null && (
          <>
            <line
              x1={xFor(highlightN)}
              x2={xFor(highlightN)}
              y1={M.t}
              y2={M.t + plotH}
              stroke="var(--admin-chart-1)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.6}
            />
            <circle cx={xFor(highlightN)} cy={yFor(highlightPower)} r={5} fill="var(--admin-chart-1)" stroke="var(--admin-surface)" strokeWidth={2} />
          </>
        )}

        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={M.t} y2={M.t + plotH} stroke="var(--admin-muted-2)" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={hover.x} cy={hover.y} r={4} fill="var(--admin-surface)" stroke="var(--admin-chart-1)" strokeWidth={2} />
          </>
        )}

        <text x={M.l + plotW / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="var(--admin-muted)">
          {xLabel}
        </text>
      </svg>
      {hover && (
        <div
          style={{
            position: "absolute",
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: "translate(-50%, -130%)",
            background: "var(--admin-surface-raised)",
            border: "1px solid var(--admin-border)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            color: "var(--admin-text)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "var(--admin-shadow-sm)",
            zIndex: 1,
          }}
        >
          N = {hover.n} → {hover.power == null ? "—" : `${Math.round(hover.power * 100)}% power`}
        </div>
      )}
    </div>
  );
}

function EffectSizeHelper({ familyId, onCompute }) {
  const [m1, setM1] = useState(""), [sd1, setSd1] = useState(""), [n1, setN1] = useState("");
  const [m2, setM2] = useState(""), [sd2, setSd2] = useState(""), [n2, setN2] = useState("");

  if (familyId !== "means" && familyId !== "paired") return null;

  const compute = () => {
    const d = cohensDFromMeans({
      mean1: Number(m1),
      sd1: Number(sd1),
      n1: n1 ? Number(n1) : undefined,
      mean2: Number(m2),
      sd2: Number(sd2),
      n2: n2 ? Number(n2) : undefined,
    });
    if (d != null) onCompute(Math.abs(d));
  };

  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid var(--admin-border-subtle)", background: "var(--admin-surface-alt)" }}>
      <div style={{ fontSize: 11, color: "var(--admin-muted)", marginBottom: 8 }}>
        Compute {familyId === "paired" ? "dz" : "d"} from raw means/SDs (e.g. from a pilot study or a published report) — group sizes are optional.
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" placeholder="Mean 1" value={m1} onChange={(e) => setM1(e.target.value)} style={{ ...fieldInputStyle, width: 80 }} />
          <input type="number" placeholder="SD 1" value={sd1} onChange={(e) => setSd1(e.target.value)} style={{ ...fieldInputStyle, width: 70 }} />
          <input type="number" placeholder="n1 (optional)" value={n1} onChange={(e) => setN1(e.target.value)} style={{ ...fieldInputStyle, width: 90 }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" placeholder="Mean 2" value={m2} onChange={(e) => setM2(e.target.value)} style={{ ...fieldInputStyle, width: 80 }} />
          <input type="number" placeholder="SD 2" value={sd2} onChange={(e) => setSd2(e.target.value)} style={{ ...fieldInputStyle, width: 70 }} />
          <input type="number" placeholder="n2 (optional)" value={n2} onChange={(e) => setN2(e.target.value)} style={{ ...fieldInputStyle, width: 90 }} />
        </div>
        <Button size="sm" variant="secondary" onClick={compute} disabled={!m1 || !sd1 || !m2 || !sd2}>
          Compute
        </Button>
      </div>
    </div>
  );
}

function ObservedEffectSizePicker({ familyId, groupComparison, onUse }) {
  const [selectedKey, setSelectedKey] = useState("");
  const groupCount = groupComparison?.groups?.length || 0;

  const candidates = useMemo(() => {
    if (!groupComparison) return [];
    if (familyId === "means" || familyId === "anova") {
      const minGroups = familyId === "means" ? 2 : 2;
      return (groupComparison.numericComparisons || [])
        .filter((c) => (c.perGroup || []).filter((g) => g.n > 0).length >= minGroups)
        .map((c) => ({ key: c.key, label: c.label, perGroup: c.perGroup }));
    }
    if (familyId === "chisq") {
      return (groupComparison.categoricalComparisons || [])
        .filter((c) => c.test && c.test.n > 0)
        .map((c) => ({ key: c.key, label: c.label, test: c.test }));
    }
    return [];
  }, [familyId, groupComparison]);

  useEffect(() => {
    setSelectedKey(candidates[0]?.key || "");
  }, [familyId, candidates]);

  if (!groupComparison || groupCount < 2 || !candidates.length) return null;

  const use = () => {
    const target = candidates.find((c) => c.key === selectedKey);
    if (!target) return;
    if (familyId === "chisq") {
      const w = cohensWFromChiSquare(target.test.chisq, target.test.n);
      if (w != null) onUse(w);
      return;
    }
    if (familyId === "means") {
      const two = (target.perGroup || []).filter((g) => g.n > 0).slice(0, 2);
      const d = cohensDFromMeans({ mean1: two[0]?.mean, sd1: two[0]?.sd, n1: two[0]?.n, mean2: two[1]?.mean, sd2: two[1]?.sd, n2: two[1]?.n });
      if (d != null) onUse(Math.abs(d));
      return;
    }
    const f = cohensFFromGroups(target.perGroup);
    if (f != null) onUse(f);
  };

  return (
    <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>Use the observed effect size from this survey's data:</span>
      <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} style={{ ...fieldInputStyle, maxWidth: 260 }}>
        {candidates.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <Button size="sm" variant="secondary" onClick={use}>
        Use
      </Button>
    </div>
  );
}

function formatResultHeadline(familyId, analysisType, family, result, ctx) {
  if (!result) return "Enter a positive effect size to see a result.";
  const { alpha, power, n, tails, groups } = ctx;
  const g = Math.max(2, Number(groups) || 2);

  if (analysisType === "apriori") {
    if (familyId === "means" || familyId === "anova") {
      return (
        <>
          You need approximately <strong>{result.value.toLocaleString()} participants {family.unit}</strong> (about{" "}
          {result.total.toLocaleString()} total across {g} group{g === 1 ? "" : "s"}) to detect this effect at α = {alpha} with{" "}
          {Math.round(power * 100)}% power{tails === 1 ? " (one-tailed)" : ""}.
        </>
      );
    }
    if (familyId === "anova2way") {
      return (
        <>
          You need approximately <strong>{result.value.toLocaleString()} participants {family.unit}</strong> (about{" "}
          {result.total.toLocaleString()} total across {result.cells} cells, interaction df = {result.df1}) to detect this interaction at
          α = {alpha} with {Math.round(power * 100)}% power.
        </>
      );
    }
    return (
      <>
        You need approximately <strong>{result.value.toLocaleString()} {family.unit}</strong> to detect this effect at α = {alpha} with{" "}
        {Math.round(power * 100)}% power{tails === 1 ? " (one-tailed)" : ""}.
      </>
    );
  }
  if (analysisType === "posthoc") {
    return (
      <>
        With N = {n.toLocaleString()} {family.unit} and this effect size, you have approximately{" "}
        <strong>{Math.round(result.value * 100)}% power</strong> to detect it at α = {alpha}
        {tails === 1 ? " (one-tailed)" : ""}.
      </>
    );
  }
  return (
    <>
      With N = {n.toLocaleString()} {family.unit} and {Math.round(power * 100)}% desired power, the smallest{" "}
      {family.effectLabel} you could reliably detect is approximately <strong>{result.value.toFixed(3)}</strong> at α = {alpha}
      {tails === 1 ? " (one-tailed)" : ""}.
    </>
  );
}

export function PowerAnalysisModal({ onClose, survey, groupComparison }) {
  const surveyGroupCount = Array.isArray(survey?.experiment_groups) ? survey.experiment_groups.length : 0;

  const [analysisType, setAnalysisType] = useState("apriori");
  const [familyId, setFamilyId] = useState(surveyGroupCount >= 3 ? "anova" : "means");
  const [effectSize, setEffectSize] = useState(COHEN_D.medium);
  const [alpha, setAlpha] = useState(0.05);
  const [power, setPower] = useState(0.8);
  const [n, setN] = useState(60);
  const [tails, setTails] = useState(2);
  const [groups, setGroups] = useState(Math.max(2, surveyGroupCount || 2));
  const [categories, setCategories] = useState(2);
  const [showEffectHelper, setShowEffectHelper] = useState(false);

  // Factorial ANOVA interaction (anova2way) — Factor A defaults to this
  // survey's own experiment groups (the manipulated conditions), Factor B
  // defaults to 2 (the common minimal case: a binary moderator like party,
  // or a median-split of a continuous one).
  const [levelsA, setLevelsA] = useState(Math.max(2, surveyGroupCount || 5));
  const [levelsB, setLevelsB] = useState(2);
  // Moderated-regression interaction (modreg) — defaults to "the interaction
  // terms are the only predictors in the model" (interactionDf ===
  // totalPredictors), the simplest case; a researcher with real main-effect
  // predictors already in the model should raise totalPredictors above
  // interactionDf.
  const [interactionDf, setInteractionDf] = useState(Math.max(1, surveyGroupCount - 1 || 4));
  const [totalPredictors, setTotalPredictors] = useState(Math.max(1, surveyGroupCount - 1 || 4));

  useEffect(() => {
    if (surveyGroupCount >= 2) {
      setGroups(surveyGroupCount);
      setLevelsA(surveyGroupCount);
      setInteractionDf(Math.max(1, surveyGroupCount - 1));
      setTotalPredictors(Math.max(1, surveyGroupCount - 1));
    }
  }, [surveyGroupCount]);

  const family = FAMILIES.find((f) => f.id === familyId);

  const changeFamily = (id) => {
    setFamilyId(id);
    const f = FAMILIES.find((x) => x.id === id);
    setEffectSize(f.benchmarks.medium);
    setShowEffectHelper(false);
  };

  const nearestLabel = nearestCohenLabel(family.benchmarks, effectSize);

  const ctx = { effectSize, alpha, power, n, tails, groups, categories, levelsA, levelsB, interactionDf, totalPredictors };
  const result = effectSize > 0 || analysisType === "sensitivity" ? computeResult(familyId, analysisType, ctx) : null;

  // The chart always plots power vs N *at the effect size the current
  // analysis is actually about* — in sensitivity mode that's the
  // just-computed minimum detectable effect (the `effectSize` field is
  // hidden and stale in that mode), not the raw input state.
  const chartEffectSize = analysisType === "sensitivity" ? (result ? result.value : effectSize) : effectSize;
  const chartCtx = { ...ctx, effectSize: chartEffectSize };

  const highlightN = analysisType === "apriori" ? (result ? result.value : n) : n;
  const chartMax = Math.max(20, Math.ceil((highlightN || 20) * 2.4));

  const liveGroups = groupComparison?.groups || [];
  const totalCollected = liveGroups.reduce((s, g) => s + (g.n || 0), 0);
  const targetTotal = analysisType === "apriori" && result ? result.total || result.value : null;

  return (
    <Modal title="Power analysis" subtitle="Plan a study before launching, or check where a live study stands." onClose={onClose} width={860}>
      <Tabs tabs={ANALYSIS_TYPES} activeId={analysisType} onChange={setAnalysisType} ariaLabel="Analysis type" />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <label style={{ ...labelStyle, minWidth: 260 }}>
          Comparison
          <select value={familyId} onChange={(e) => changeFamily(e.target.value)} style={{ ...fieldInputStyle }}>
            {FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        {familyId === "anova" && (
          <label style={labelStyle}>
            Groups
            <input type="number" min={2} value={groups} onChange={(e) => setGroups(Math.max(2, Number(e.target.value) || 2))} style={{ ...fieldInputStyle, width: 70 }} />
          </label>
        )}

        {familyId === "chisq" && (
          <>
            <label style={labelStyle}>
              Groups
              <input type="number" min={2} value={groups} onChange={(e) => setGroups(Math.max(2, Number(e.target.value) || 2))} style={{ ...fieldInputStyle, width: 70 }} />
            </label>
            <label style={labelStyle}>
              Outcome categories
              <input type="number" min={2} value={categories} onChange={(e) => setCategories(Math.max(2, Number(e.target.value) || 2))} style={{ ...fieldInputStyle, width: 70 }} />
            </label>
            <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>df = {computeDfForChisq(groups, categories)}</div>
          </>
        )}

        {familyId === "anova2way" && (
          <>
            <label style={labelStyle}>
              Factor A levels
              <input
                type="number"
                min={2}
                value={levelsA}
                onChange={(e) => setLevelsA(Math.max(2, Number(e.target.value) || 2))}
                style={{ ...fieldInputStyle, width: 70 }}
                title="Your manipulated conditions — e.g. 5, for a 5-condition study."
              />
            </label>
            <label style={labelStyle}>
              Factor B levels
              <input
                type="number"
                min={2}
                value={levelsB}
                onChange={(e) => setLevelsB(Math.max(2, Number(e.target.value) || 2))}
                style={{ ...fieldInputStyle, width: 70 }}
                title="Your categorical moderator — e.g. 2 or 3, for a party-affiliation grouping."
              />
            </label>
            <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>
              interaction df = {(Math.max(2, Number(levelsA) || 2) - 1) * (Math.max(2, Number(levelsB) || 2) - 1)}
            </div>
          </>
        )}

        {familyId === "modreg" && (
          <>
            <label style={labelStyle}>
              Interaction df
              <input
                type="number"
                min={1}
                value={interactionDf}
                onChange={(e) => setInteractionDf(Math.max(1, Number(e.target.value) || 1))}
                style={{ ...fieldInputStyle, width: 70 }}
                title="Number of interaction terms tested at once — e.g. 4, for a 5-level condition's dummy codes each interacting with one continuous moderator."
              />
            </label>
            <label style={labelStyle}>
              Total predictors in full model
              <input
                type="number"
                min={interactionDf}
                value={totalPredictors}
                onChange={(e) => setTotalPredictors(Math.max(Number(interactionDf) || 1, Number(e.target.value) || 1))}
                style={{ ...fieldInputStyle, width: 70 }}
                title="Every predictor in the model once the interaction is added — condition dummies + moderator + interaction terms. Must be at least the interaction df."
              />
            </label>
          </>
        )}

        {family.hasTails && (
          <label style={labelStyle}>
            Tails
            <select value={tails} onChange={(e) => setTails(Number(e.target.value))} style={{ ...fieldInputStyle, width: 90 }}>
              <option value={2}>Two</option>
              <option value={1}>One</option>
            </select>
          </label>
        )}

        <label style={labelStyle}>
          Significance (α)
          <input
            type="number"
            step="0.01"
            min="0.001"
            max="0.5"
            value={alpha}
            onChange={(e) => setAlpha(Math.min(0.5, Math.max(0.001, Number(e.target.value) || 0.05)))}
            style={{ ...fieldInputStyle, width: 80 }}
          />
        </label>

        {analysisType !== "posthoc" && (
          <label style={labelStyle}>
            Desired power
            <input
              type="number"
              step="0.01"
              min="0.5"
              max="0.99"
              value={power}
              onChange={(e) => setPower(Math.min(0.99, Math.max(0.5, Number(e.target.value) || 0.8)))}
              style={{ ...fieldInputStyle, width: 80 }}
            />
          </label>
        )}

        {analysisType !== "apriori" && (
          <label style={labelStyle}>
            N ({family.unit})
            <input type="number" min={2} value={n} onChange={(e) => setN(Math.max(2, Number(e.target.value) || 2))} style={{ ...fieldInputStyle, width: 90 }} />
          </label>
        )}

        {analysisType !== "sensitivity" && (
          <label style={labelStyle}>
            Expected effect size ({family.effectLabel})
            <input
              type="number"
              step="0.01"
              min="0"
              value={effectSize}
              onChange={(e) => setEffectSize(Math.max(0, Number(e.target.value) || 0))}
              style={{ ...fieldInputStyle, width: 100 }}
            />
          </label>
        )}

        {analysisType !== "sensitivity" && (
          <div style={{ display: "flex", gap: 4 }}>
            {Object.entries(family.benchmarks).map(([label, v]) => (
              <button
                key={label}
                type="button"
                onClick={() => setEffectSize(v)}
                style={nearestLabel === label ? { ...pillStyle, ...pillActiveStyle } : pillStyle}
                title={`${label[0].toUpperCase()}${label.slice(1)} effect (${family.effectLabel} = ${v})`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {analysisType !== "sensitivity" && (familyId === "means" || familyId === "paired") && (
        <div style={{ marginBottom: 6 }}>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setShowEffectHelper((v) => !v)}
            style={{ border: "none", background: "none", padding: 0, color: "var(--admin-accent)", cursor: "pointer", fontSize: 12 }}
          >
            {showEffectHelper ? "Hide" : "Compute effect size from raw means/SDs"}
          </button>
          {showEffectHelper && <EffectSizeHelper familyId={familyId} onCompute={setEffectSize} />}
        </div>
      )}

      {analysisType !== "sensitivity" && (
        <ObservedEffectSizePicker familyId={familyId} groupComparison={groupComparison} onUse={setEffectSize} />
      )}

      <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5 }}>{formatResultHeadline(familyId, analysisType, family, result, ctx)}</div>

      <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 4, marginBottom: 16 }}>{FAMILY_NOTES[familyId]}</div>

      <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--admin-border-subtle)", background: "var(--admin-surface-alt)" }}>
        <PowerCurveChart
          computePower={(nAtPoint) => powerAt(familyId, chartCtx, nAtPoint)}
          nMin={2}
          nMax={chartMax}
          targetPower={power}
          highlightN={Math.max(2, highlightN || 2)}
          xLabel={`N (${family.unit})`}
        />
      </div>

      {analysisType === "apriori" && liveGroups.length > 0 && result && (
        <div style={{ marginTop: 16 }}>
          {familyId === "means" || familyId === "anova" ? (
            <div style={{ overflowX: "auto" }}>
              <Table>
                <thead>
                  <Tr>
                    <Th>Group</Th>
                    <Th>Current n</Th>
                    <Th>Target n</Th>
                    <Th>Status</Th>
                  </Tr>
                </thead>
                <tbody>
                  {liveGroups.map((g) => {
                    const met = g.n >= result.value;
                    return (
                      <Tr key={g.id}>
                        <Td>{g.name || g.id}</Td>
                        <Td>{g.n}</Td>
                        <Td>{result.value}</Td>
                        <Td>
                          <Badge tone={met ? "accent" : "neutral"}>{met ? "Target met" : `${Math.max(0, result.value - g.n)} more needed`}</Badge>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          ) : (
            <div style={{ fontSize: 13 }}>
              Collected so far: <strong>{totalCollected.toLocaleString()}</strong> / target{" "}
              <strong>{Math.round(targetTotal).toLocaleString()}</strong> —{" "}
              <Badge tone={totalCollected >= targetTotal ? "accent" : "neutral"}>
                {totalCollected >= targetTotal ? "Target met" : `${Math.max(0, Math.round(targetTotal - totalCollected)).toLocaleString()} more needed`}
              </Badge>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
