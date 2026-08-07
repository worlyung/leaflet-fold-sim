/**
 * Saddle-stitch (중철) sheet imposition.
 * N pages must be a multiple of 4.
 * Sheet 0 = outermost (covers).
 *
 * 1-based example N=8:
 *   Sheet1 front: 8 | 1    back: 2 | 7
 *   Sheet2 front: 6 | 3    back: 4 | 5
 */

/**
 * @param {number} pageCount - total pages (multiple of 4)
 * @returns {Array<{
 *   sheetIndex: number,
 *   sheetLabel: string,
 *   front: { left: number, right: number },
 *   back: { left: number, right: number },
 *   note: string
 * }>} page indices are 0-based
 */
export function buildSaddleImposition(pageCount) {
  const N = pageCount;
  if (N < 4 || N % 4 !== 0) {
    throw new Error(`중철 임포지션은 페이지 수가 4의 배수여야 합니다 (현재 ${N}).`);
  }
  const sheets = N / 4;
  const out = [];
  for (let s = 0; s < sheets; s++) {
    // 0-based page indices
    const frontLeft = N - 1 - 2 * s;
    const frontRight = 2 * s;
    const backLeft = 2 * s + 1;
    const backRight = N - 2 - 2 * s;
    const outer = s === 0;
    out.push({
      sheetIndex: s,
      sheetLabel: outer ? `시트 ${s + 1} (표지·가장 바깥)` : `시트 ${s + 1}`,
      front: { left: frontLeft, right: frontRight },
      back: { left: backLeft, right: backRight },
      note: outer
        ? "바깥쪽 장 — 앞면 오른쪽에 표지(1p)"
        : `안쪽 ${s}번째 장`,
    });
  }
  return out;
}

/** Human-readable line for one side */
export function formatSide(side, pageCount) {
  const L = side.left + 1;
  const R = side.right + 1;
  const lTag = side.left === 0 ? "표지" : side.left === pageCount - 1 ? "뒤표지" : "";
  const rTag = side.right === 0 ? "표지" : side.right === pageCount - 1 ? "뒤표지" : "";
  return `${L}${lTag ? `(${lTag})` : ""} | ${R}${rTag ? `(${rTag})` : ""}`;
}

/**
 * Parent sheet size estimate: two pages side by side on each face.
 * @param {{widthMm:number,heightMm:number}} pageSize finished page
 */
export function sheetSizeFromPage(pageSize) {
  return {
    widthMm: pageSize.widthMm * 2,
    heightMm: pageSize.heightMm,
  };
}

/**
 * Common parent-sheet presets for saddle stitch (mm, short×long as stored).
 * Needed = finished page width×2 × height (two-up).
 */
export const PARENT_SHEET_PRESETS = [
  { id: "a3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "a4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "a2", label: "A2", widthMm: 420, heightMm: 594 },
  { id: "b4_iso", label: "B4 (ISO)", widthMm: 250, heightMm: 353 },
  { id: "b3_iso", label: "B3 (ISO)", widthMm: 353, heightMm: 500 },
  { id: "srai3", label: "국4절(≈A3급)", widthMm: 297, heightMm: 420 },
  { id: "custom", label: "직접 입력", widthMm: null, heightMm: null },
];

/**
 * Finished page → recommended parent sheet (two-up landscape on parent).
 * Page portrait W×H → parent needs ~ (2W)×H, often rotated to fit standard.
 *
 * @param {{widthMm:number,heightMm:number}} pageSize
 * @param {Array<{id:string,label:string,widthMm:number|null,heightMm:number|null}>} [catalog]
 */
export function suggestParentSheet(pageSize, catalog = PARENT_SHEET_PRESETS) {
  const needW = pageSize.widthMm * 2;
  const needH = pageSize.heightMm;
  // Also allow rotated parent (swap)
  const fits = (pw, ph) =>
    (pw + 0.5 >= needW && ph + 0.5 >= needH) ||
    (pw + 0.5 >= needH && ph + 0.5 >= needW);

  const standards = catalog.filter((c) => c.widthMm && c.heightMm);
  // Prefer smallest area that fits
  const ranked = standards
    .map((c) => {
      const a = c.widthMm * c.heightMm;
      const ok = fits(c.widthMm, c.heightMm);
      const waste = ok
        ? Math.min(
            c.widthMm * c.heightMm - needW * needH,
            c.widthMm * c.heightMm - needH * needW
          )
        : Infinity;
      // orientation: if needW×needH fits as-is on parent short×long or rotated
      let orientation = "as_is";
      if (c.widthMm + 0.5 >= needW && c.heightMm + 0.5 >= needH) {
        orientation = "page_portrait_on_sheet";
      } else if (c.widthMm + 0.5 >= needH && c.heightMm + 0.5 >= needW) {
        orientation = "rotate_sheet_or_page";
      }
      return { ...c, ok, waste, area: a, orientation, needW, needH };
    })
    .filter((x) => x.ok)
    .sort((a, b) => a.waste - b.waste || a.area - b.area);

  const best = ranked[0] || null;
  const exact =
    pageSize.widthMm === 148 && pageSize.heightMm === 210
      ? { id: "a4", reason: "A5 완성 → 부모 A4 양면 2up 중철이 가장 흔함" }
      : pageSize.widthMm === 210 && pageSize.heightMm === 297
        ? { id: "a3", reason: "A4 완성 → 부모 A3 양면 2up 중철이 가장 흔함" }
        : pageSize.widthMm === 182 && pageSize.heightMm === 257
          ? { id: "b4_iso", reason: "B5(JIS) → 부모 B4급 2up 검토" }
          : null;

  let pick = best;
  if (exact) {
    const ex = ranked.find((r) => r.id === exact.id) || standards.find((s) => s.id === exact.id);
    if (ex && fits(ex.widthMm, ex.heightMm)) {
      pick = { ...ex, ok: true, needW, needH, orientation: best?.orientation || "page_portrait_on_sheet", waste: 0, area: ex.widthMm * ex.heightMm };
    }
  }

  return {
    need: { widthMm: needW, heightMm: needH },
    suggested: pick,
    reason: exact?.reason || (pick ? `필요 ${needW}×${needH}mm에 가장 가까운 표준지` : "표준 규격에 안 맞음 — 커스텀 부모 용지"),
    alternatives: ranked.slice(0, 4),
  };
}

/**
 * Perfect-bound / spiral: simple leaf guide (not saddle signatures).
 * Each physical leaf: front = odd page, back = even (1-based).
 * Sheet index 0: front p1, back p2 …
 *
 * @param {number} pageCount even recommended
 */
export function buildPerfectBoundLeaves(pageCount) {
  const N = pageCount;
  if (N < 2) throw new Error("페이지 수가 너무 적습니다.");
  const leaves = Math.ceil(N / 2);
  const out = [];
  for (let i = 0; i < leaves; i++) {
    const front = i * 2; // 0-based
    const back = i * 2 + 1;
    out.push({
      leafIndex: i,
      leafLabel: `리프 ${i + 1}`,
      front: front < N ? front : null,
      back: back < N ? back : null,
      readerNote:
        front < N && back < N
          ? `읽는 순서 ${front + 1} → ${back + 1}`
          : front < N
            ? `읽는 순서 ${front + 1} (뒤 빈면)`
            : "빈 리프",
    });
  }
  return out;
}

/**
 * Reader-order checklist for perfect bound (1…N).
 */
export function buildReaderOrder(pageCount) {
  return Array.from({ length: pageCount }, (_, i) => ({
    pageIndex: i,
    pageNum: i + 1,
    role:
      i === 0
        ? "표지"
        : i === pageCount - 1
          ? "뒤표지"
          : i === 1
            ? "내지 시작"
            : "내지",
  }));
}
