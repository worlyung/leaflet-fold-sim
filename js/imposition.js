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
