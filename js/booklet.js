/**
 * Multi-page booklet / brochure helpers.
 */

/** Recommend page counts for binding type. */
export function normalizePageCount(n, bindingId) {
  let count = Math.max(2, Math.min(64, Math.floor(Number(n) || 8)));
  if (bindingId === "saddle_stitch") {
    // 중철: 보통 4의 배수 (한 장이 4페이지)
    if (count % 4 !== 0) count = Math.ceil(count / 4) * 4;
    count = Math.max(4, count);
  } else {
    // 무선 등: 짝수 권장
    if (count % 2 !== 0) count += 1;
  }
  return count;
}

/**
 * Build list of spreads for viewer.
 * Cover-first model (1-based labels):
 *  - spread 0: right only = page 1 (표지)
 *  - spread 1..: left = 2k, right = 2k+1
 *  - last may be back cover alone on left or right depending on count
 *
 * Returns array of { left: pageIndex|null, right: pageIndex|null } 0-based page indices.
 */
export function buildSpreads(pageCount) {
  const n = pageCount;
  const spreads = [];

  // Front cover alone
  spreads.push({ left: null, right: 0, label: "표지" });

  // Interior spreads: pages 1-2, 3-4, ... as 0-based (1,2), (3,4)...
  let i = 1;
  while (i < n) {
    const left = i;
    const right = i + 1 < n ? i + 1 : null;
    spreads.push({
      left,
      right,
      label: right != null ? `${left + 1}–${right + 1}` : `${left + 1}`,
    });
    i += 2;
  }

  return spreads;
}

/**
 * Sheet count estimate for saddle stitch (A3 sheet folded = 4 pages of A4, etc.)
 * finished page size vs parent sheet is informational only.
 */
export function estimateSheets(pageCount, bindingId) {
  if (bindingId === "saddle_stitch") {
    return {
      sheets: pageCount / 4,
      note: `중철: 약 ${pageCount / 4}장(펼친 용지) → 접어 ${pageCount}페이지`,
    };
  }
  if (bindingId === "perfect_bound") {
    return {
      sheets: Math.ceil(pageCount / 2),
      note: `무선: 약 ${Math.ceil(pageCount / 2)}장 앞뒤 인쇄 후 제본 (단순 추정)`,
    };
  }
  return {
    sheets: Math.ceil(pageCount / 2),
    note: `약 ${Math.ceil(pageCount / 2)}장 추정`,
  };
}

export function pageLabel(index, pageCount) {
  if (index === 0) return "1 · 표지";
  if (index === pageCount - 1) return `${pageCount} · 뒤표지`;
  return `${index + 1}`;
}
