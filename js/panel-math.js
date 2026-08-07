/**
 * Panel width / height calculation for leaflet folds.
 * Units: mm. Algorithms match presets.json.
 */

/**
 * @param {number} axisLength - length along fold axis (mm)
 * @param {number} panelCount
 * @param {string} algorithm - equal | c_fold_inner_narrow | gate_wings_narrow | roll_progressive_narrow | cross_half
 * @param {number} deltaMm
 * @returns {number[]} panel sizes along axis, sum ≈ axisLength
 */
export function computePanelSizes(axisLength, panelCount, algorithm, deltaMm = 2) {
  const L = Math.max(1, Number(axisLength) || 1);
  const n = Math.max(1, Math.floor(panelCount) || 1);
  const d = Math.max(0, Number(deltaMm) || 0);

  switch (algorithm) {
    case "c_fold_inner_narrow":
      return cFoldInnerNarrow(L, n, d);
    case "gate_wings_narrow":
      return gateWingsNarrow(L, n, d);
    case "roll_progressive_narrow":
      return rollProgressiveNarrow(L, n, d);
    case "cross_half":
      return equalSplit(L, n);
    case "equal":
    default:
      return equalSplit(L, n);
  }
}

function equalSplit(L, n) {
  const base = L / n;
  const sizes = Array(n).fill(0).map(() => round2(base));
  return fixSum(sizes, L);
}

/**
 * C-fold: outermost panels share most of the width; innermost tucks in narrower.
 * For 3 panels: [outer, middle, inner_tuck] with inner = outer - d (approx).
 */
function cFoldInnerNarrow(L, n, d) {
  if (n < 3) return equalSplit(L, n);

  // For classic 3-panel C-fold
  if (n === 3) {
    // Target: outer ≈ middle, inner = outer - d, sum = L
    // 2*outer + (outer - d) = L  =>  3*outer - d = L  => outer = (L + d) / 3
    let outer = (L + d) / 3;
    let middle = outer;
    let inner = outer - d;
    if (inner < L * 0.15) {
      // safety floor
      inner = L * 0.2;
      outer = middle = (L - inner) / 2;
    }
    return fixSum([round2(outer), round2(middle), round2(inner)], L);
  }

  // General: last panel narrower by d relative to equal share
  const equal = L / n;
  const sizes = Array(n).fill(0).map((_, i) => {
    if (i === n - 1) return Math.max(equal - d, equal * 0.7);
    return equal;
  });
  return fixSum(sizes.map(round2), L);
}

/**
 * Gate: left wing, center (may be 1 or 2 panels), right wing.
 * For 4 panels: [left_wing, center_left, center_right, right_wing]
 * Center takes ~50%, wings share rest, each wing reduced conceptually by d/2 packing.
 */
function gateWingsNarrow(L, n, d) {
  if (n === 4) {
    const centerTotal = L * 0.5;
    const wingTotal = L - centerTotal;
    let wing = wingTotal / 2 - d / 2;
    if (wing < L * 0.12) wing = L * 0.15;
    const centerEach = (L - 2 * wing) / 2;
    return fixSum(
      [round2(wing), round2(centerEach), round2(centerEach), round2(wing)],
      L
    );
  }
  if (n === 3) {
    // open gate: left, center, right — wings narrower
    let wing = (L - d) / 4;
    let center = L - 2 * wing;
    return fixSum([round2(wing), round2(center), round2(wing)], L);
  }
  return equalSplit(L, n);
}

function rollProgressiveNarrow(L, n, d) {
  // outer widest; each subsequent -= d; renormalize
  const raw = [];
  for (let i = 0; i < n; i++) {
    raw.push(Math.max(1, 10 + (n - 1 - i) * d));
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((v) => (v / sum) * L);
  return fixSum(scaled.map(round2), L);
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/** Adjust last panel so sum equals L exactly (within 0.01). */
function fixSum(sizes, L) {
  const s = sizes.reduce((a, b) => a + b, 0);
  const diff = round2(L - s);
  if (sizes.length === 0) return sizes;
  sizes[sizes.length - 1] = round2(sizes[sizes.length - 1] + diff);
  return sizes;
}

/**
 * Resolve open sheet mm after orientation.
 * Portrait: widthMm x heightMm as stored (short x long for A series).
 * Landscape: swap.
 */
export function resolveSheetMm(size, orientation) {
  let w = size.widthMm;
  let h = size.heightMm;
  if (w == null || h == null) {
    throw new Error("custom size requires widthMm and heightMm");
  }
  if (orientation === "landscape") {
    return { widthMm: Math.max(w, h) === w ? w : h, heightMm: Math.max(w, h) === w ? h : w, raw: { w, h } };
  }
  // portrait: ensure height is the longer side for standard ISO labels if needed —
  // use stored values as-is (presets already short x long).
  return { widthMm: w, heightMm: h };
}

/**
 * Compute panel rectangles in sheet space (mm).
 * foldAxis vertical => panels left-to-right (sizes along width)
 * foldAxis horizontal => panels top-to-bottom (sizes along height)
 */
export function computePanels(sheet, fold, foldAxis, deltaMm) {
  const { widthMm, heightMm } = sheet;
  const n = fold.panelCount;
  const algorithm = fold.algorithm || "equal";

  if (foldAxis === "horizontal") {
    const heights = computePanelSizes(heightMm, n, algorithm, deltaMm);
    let y = 0;
    return heights.map((hh, i) => {
      const rect = { index: i, x: 0, y, width: widthMm, height: hh };
      y += hh;
      return rect;
    });
  }

  // vertical (default): left → right
  const widths = computePanelSizes(widthMm, n, algorithm, deltaMm);
  let x = 0;
  return widths.map((ww, i) => {
    const rect = { index: i, x, y: 0, width: ww, height: heightMm };
    x += ww;
    return rect;
  });
}

/**
 * Approximate finished (folded) outer size in mm.
 */
export function approxFinishedSize(sheet, fold, foldAxis, panels) {
  if (foldAxis === "horizontal") {
    // stacked by height panels — finished height = max panel height (top panel), width full
    const h = Math.max(...panels.map((p) => p.height));
    return { widthMm: sheet.widthMm, heightMm: round2(h) };
  }
  // vertical folds: finished width = first (cover) panel width for C/Z/half
  const coverW = panels[0]?.width ?? sheet.widthMm / fold.panelCount;
  return { widthMm: round2(coverW), heightMm: sheet.heightMm };
}

/**
 * Scale mm → CSS px so sheet fits in max box.
 */
export function mmToScale(widthMm, heightMm, maxW, maxH, padding = 24) {
  const aw = Math.max(1, maxW - padding * 2);
  const ah = Math.max(1, maxH - padding * 2);
  return Math.min(aw / widthMm, ah / heightMm);
}
