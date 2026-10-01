import {
  computePanels,
  approxFinishedSize,
  mmToScale,
} from "./panel-math.js";
import { Leaflet3DViewer } from "./viewer-3d.js";
import { foldCovers, foldFaceLabel } from "./fold-faces.js";
import { initStudioUI } from "./studio-ui.js";
import {
  normalizePageCount,
  bookPageLimit,
  buildSpreads,
  estimateSheets,
  pageLabel,
  assembleBookPages,
} from "./booklet.js";
import { createPageCurlBook } from "./page-curl.js";
import {
  buildSaddleImposition,
  formatSide,
  sheetSizeFromPage,
  suggestParentSheet,
  PARENT_SHEET_PRESETS,
  buildPerfectBoundLeaves,
  buildReaderOrder,
} from "./imposition.js";
import {
  listTemplates,
  upsertTemplate,
  deleteTemplate,
  getTemplate,
  downloadTemplatesJson,
  importTemplatesFromFile,
} from "./shop-templates.js";
import {
  renderFoldFlatCanvas,
  renderImpositionCanvas,
  renderImpositionSheetCanvases,
  downloadCanvasPng,
  downloadCanvasesPdf,
} from "./export-flat.js";
import { pdfToImages } from "./pdf-import.js";

const state = {
  presets: null,
  productMode: "fold", // fold | booklet

  // fold
  sizeId: "a4",
  foldId: "half",
  orientation: "landscape",
  foldAxis: "vertical",
  deltaMm: 2,
  customW: 210,
  customH: 297,
  viewMode: "orbit3d",
  showSide: "front",
  foldAmount: 0.65,
  frontImage: null,
  backImage: null,
  /** @type {Record<string, HTMLImageElement>} */
  panelImages: {},
  viewer3d: null,

  // booklet
  bookletSizeId: "a5",
  bookletCustomW: 148,
  bookletCustomH: 210,
  bookletOrient: "portrait",
  bindingId: "hardcover",
  brochure: false,
  pageCount: 12,
  /** @type {(HTMLImageElement|null)[]} */
  pageImages: [],
  spreadIndex: 0,
  curlBook: null,
  book3dViewer: null,
  parentSheetId: "auto",
  parentCustomW: 297,
  parentCustomH: 420,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let studio;

// 선택 상태를 시각(.active)과 보조기술(aria) 양쪽에 동시에 반영한다.
const setActive = (el, on) => {
  el.classList.toggle("active", on);
  el.setAttribute(
    el.getAttribute("role") === "tab" ? "aria-selected" : "aria-pressed",
    on ? "true" : "false"
  );
};

async function main() {
  try {
    const res = await fetch("./presets.json");
    if (!res.ok) throw new Error(`presets.json HTTP ${res.status}`);
    state.presets = await res.json();
  } catch (err) {
    showBanner(
      `presets.json을 불러오지 못했습니다. start.bat으로 로컬 서버를 열어 주세요. — ${err.message}`,
      true
    );
    return;
  }

  applyDefaults();
  studio = initStudioUI({ state, renderAll, loadImageFile, showBanner, getBookletPageSize, rebuildBookletPageList });
  bindUI();
  populateSelects();
  rebuildPanelUploadSlots();
  rebuildBookletPageList();
  setProductMode(state.productMode, true);
  showBanner(
    "유형을 선택하고 이미지를 넣어 보세요. 드래그로 회전, 휠로 확대, 오른쪽 드래그로 이동해요. 입력은 현재 탭에만 유지돼요.",
    false
  );
}

/** Load ./fixtures images for quick demo (page-1.jpg/png …) */
async function loadDemoImages() {
  const loadOne = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(src));
      img.src = src;
    });
  const load = async (base) => {
    try {
      return await loadOne(`${base}.jpg`);
    } catch {
      return loadOne(`${base}.png`);
    }
  };

  try {
    if (["poster", "photozone"].includes(state.productMode)) {
      await studio.demo(load);
      showBanner("앞·뒷면 데모 이미지를 적용했어요.", false);
      return;
    }
    if (state.productMode === "fold") {
      let front;
      let back;
      try {
        front = await load("./fixtures/fold-front");
        back = await load("./fixtures/fold-back");
      } catch {
        front = await load("./fixtures/page-1");
        back = await load("./fixtures/page-2");
      }
      state.frontImage = front;
      state.backImage = back;
      $("#frontFileLabel").classList.add("has-file");
      $("#frontFileLabel").firstChild.textContent = "demo front";
      $("#backFileLabel").classList.add("has-file");
      $("#backFileLabel").firstChild.textContent = "demo back";
      showBanner("접지 데모 이미지 로드 (fixtures)", false);
    } else {
      const n = state.pageCount;
      ensurePageArray();
      let ok = 0;
      for (let i = 0; i < n; i++) {
        const num = (i % 12) + 1;
        try {
          state.pageImages[i] = await load(`./fixtures/page-${num}`);
          ok++;
        } catch {
          state.pageImages[i] = null;
        }
      }
      rebuildBookletPageList();
      showBanner(`책자 데모 ${ok}/${n}페이지 fixtures 로드`, false);
    }
    renderAll();
  } catch (err) {
    showBanner(
      `데모 이미지 실패 — node scripts/gen-fixtures.mjs 실행 후 다시 (${err.message})`,
      true
    );
  }
}

function applyDefaults() {
  const d = state.presets.defaults;
  state.sizeId = d.sizeId;
  state.foldId = d.foldId;
  state.orientation = d.orientation;
  state.foldAxis = d.foldAxis;
  state.deltaMm = d.innerNarrowDeltaMm;
  state.productMode = d.productMode || "fold";
  const b = d.booklet || {};
  state.bookletSizeId = b.sizeId || "a5";
  state.pageCount = b.pageCount || 12;
  state.bindingId = b.bindingId || "hardcover";
  state.bookletOrient = b.orientation || "portrait";
  ensurePageArray();
}

function ensurePageArray() {
  const n = state.pageCount;
  if (state.pageImages.length !== n) {
    const next = Array(n).fill(null);
    for (let i = 0; i < Math.min(n - 1, state.pageImages.length - 1); i++) {
      next[i] = state.pageImages[i];
    }
    next[n - 1] = state.pageImages[state.pageImages.length - 1] || null;
    state.pageImages = next;
  }
}

function bookImage(index) {
  if (index === 0 && state.book?.front) return state.book.front;
  if (index === state.pageCount - 1 && state.book?.back) return state.book.back;
  return state.pageImages[index];
}

function bookImages() { return Array.from({ length: state.pageCount }, (_, i) => bookImage(i)); }

function showBanner(msg, isError) {
  const el = $("#banner");
  if (!msg) {
    el.classList.remove("show", "error");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.add("show");
  el.classList.toggle("error", !!isError);
}

function getSize() {
  const s = state.presets.sizes.find((x) => x.id === state.sizeId);
  if (!s) return null;
  if (s.id === "custom") {
    return { ...s, widthMm: state.customW, heightMm: state.customH };
  }
  return s;
}

function getFold() {
  return state.presets.folds.find((x) => x.id === state.foldId);
}

function getBookletPageSize() {
  const s = state.presets.sizes.find((x) => x.id === state.bookletSizeId);
  let w = s?.widthMm ?? state.bookletCustomW;
  let h = s?.heightMm ?? state.bookletCustomH;
  if (state.bookletSizeId === "custom") {
    w = state.bookletCustomW;
    h = state.bookletCustomH;
  }
  if (state.bookletOrient === "landscape" && h > w) [w, h] = [h, w];
  if (state.bookletOrient === "portrait" && w > h) [w, h] = [h, w];
  return { widthMm: w, heightMm: h, meta: s };
}

function getSheetAndPanels() {
  const size = getSize();
  const fold = getFold();
  if (!size || !fold) return null;
  let widthMm = size.widthMm ?? state.customW;
  let heightMm = size.heightMm ?? state.customH;
  if (state.orientation === "landscape" && heightMm > widthMm) {
    [widthMm, heightMm] = [heightMm, widthMm];
  } else if (state.orientation === "portrait" && widthMm > heightMm) {
    [widthMm, heightMm] = [heightMm, widthMm];
  }
  const sheetFixed = { widthMm, heightMm };
  const panels = computePanels(sheetFixed, fold, state.foldAxis, state.deltaMm);
  const finished = approxFinishedSize(sheetFixed, fold, state.foldAxis, panels);
  return { size, fold, sheet: sheetFixed, panels, finished };
}

function populateSelects() {
  const p = state.presets;
  const sizeSel = $("#sizeSelect");
  sizeSel.innerHTML = "";
  p.ui.sizeSelectOrder.forEach((id) => {
    const s = p.sizes.find((x) => x.id === id);
    if (!s || s.role === "finished_reference") return;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.labelDetail || s.label;
    sizeSel.appendChild(opt);
  });
  sizeSel.value = state.sizeId;

  const foldSel = $("#foldSelect");
  foldSel.innerHTML = "";
  p.ui.foldSelectOrderAll.forEach((id) => {
    const f = p.folds.find((x) => x.id === id);
    if (!f) return;
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent =
      f.phase === "mvp" ? f.label : `${f.label} [${f.phase}]`;
    foldSel.appendChild(opt);
  });
  foldSel.value = state.foldId;

  $("#deltaRange").min = p.defaults.innerNarrowDeltaMinMm;
  $("#deltaRange").max = p.defaults.innerNarrowDeltaMaxMm;
  $("#deltaRange").value = state.deltaMm;
  $("#deltaOut").textContent = `${state.deltaMm} mm`;
  $("#orientSelect").value = state.orientation;
  $("#axisSelect").value = state.foldAxis;
  $("#foldAmount").value = state.foldAmount;
  $("#foldAmountOut").textContent = `${Math.round(state.foldAmount * 100)}%`;

  // booklet
  const bSize = $("#bookletSizeSelect");
  bSize.innerHTML = "";
  (p.ui.bookletSizeSelectOrder || ["a5", "a4", "b5_jis", "custom"]).forEach(
    (id) => {
      const s = p.sizes.find((x) => x.id === id);
      if (!s) return;
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.labelDetail || s.label;
      bSize.appendChild(opt);
    }
  );
  bSize.value = state.bookletSizeId;

  const bind = $("#bindingSelect");
  bind.innerHTML = "";
  (p.bindings || []).forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.label;
    bind.appendChild(opt);
  });
  bind.value = state.bindingId;
  updateBindingNote();

  refillPageCountSelect();
  $("#bookletOrient").value = state.bookletOrient;
  $("#bookletCustomW").value = state.bookletCustomW;
  $("#bookletCustomH").value = state.bookletCustomH;

  updateCustomVisibility();
  updateDeltaVisibility();
  updateBookletCustomVisibility();
  populateParentSheetSelect();
  refreshParentSheetUI();
  updateParentSheetFieldVisibility();
}

function updateParentSheetFieldVisibility() {
  const el = $("#parentSheetField");
  if (el) el.hidden = state.bindingId !== "saddle_stitch";
  const row = $("#parentCustomRow");
  if (row)
    row.hidden =
      state.bindingId !== "saddle_stitch" || state.parentSheetId !== "custom";
}

function populateParentSheetSelect() {
  const sel = $("#parentSheetSelect");
  if (!sel) return;
  const cur = state.parentSheetId || "auto";
  sel.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = "자동 추천";
  sel.appendChild(auto);
  PARENT_SHEET_PRESETS.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label + (p.widthMm ? ` (${p.widthMm}×${p.heightMm})` : "");
    sel.appendChild(opt);
  });
  sel.value = cur;
  if (![...sel.options].some((o) => o.value === cur)) sel.value = "auto";
  state.parentSheetId = sel.value;
}

function getParentSheetResolved() {
  const page = getBookletPageSize();
  const need = sheetSizeFromPage(page);
  const suggestion = suggestParentSheet(page);
  let parent = null;
  let source = "auto";

  if (state.parentSheetId === "auto") {
    if (suggestion.suggested) {
      parent = {
        id: suggestion.suggested.id,
        label: suggestion.suggested.label,
        widthMm: suggestion.suggested.widthMm,
        heightMm: suggestion.suggested.heightMm,
      };
      source = "auto";
    } else {
      parent = {
        id: "custom",
        label: "필요 치수",
        widthMm: need.widthMm,
        heightMm: need.heightMm,
      };
      source = "need";
    }
  } else if (state.parentSheetId === "custom") {
    parent = {
      id: "custom",
      label: "직접 입력",
      widthMm: state.parentCustomW,
      heightMm: state.parentCustomH,
    };
    source = "custom";
  } else {
    const p = PARENT_SHEET_PRESETS.find((x) => x.id === state.parentSheetId);
    parent = p
      ? {
          id: p.id,
          label: p.label,
          widthMm: p.widthMm,
          heightMm: p.heightMm,
        }
      : {
          id: "custom",
          label: "필요 치수",
          widthMm: need.widthMm,
          heightMm: need.heightMm,
        };
    source = "manual";
  }

  const fits =
    parent &&
    ((parent.widthMm + 0.5 >= need.widthMm &&
      parent.heightMm + 0.5 >= need.heightMm) ||
      (parent.widthMm + 0.5 >= need.heightMm &&
        parent.heightMm + 0.5 >= need.widthMm));

  return { page, need, parent, suggestion, source, fits };
}

function refreshParentSheetUI() {
  updateParentSheetFieldVisibility();
  const hint = $("#parentSheetHint");
  if (!hint) return;
  if (state.bindingId !== "saddle_stitch") {
    hint.textContent = "중철일 때만 부모 용지 매핑을 사용합니다.";
    return;
  }
  const r = getParentSheetResolved();
  const fitTxt = r.fits ? "수용 가능" : "여유 부족(재단·여백 확인)";
  hint.textContent = `필요 전개 ${r.need.widthMm}×${r.need.heightMm} mm → 부모 ${r.parent.label} ${r.parent.widthMm}×${r.parent.heightMm} mm (${fitTxt}). ${r.suggestion.reason}`;
  if (state.parentSheetId === "auto" && r.suggestion.suggested) {
    // keep select on auto; don't force change
  }
}

function refillPageCountSelect() {
  const sel = $("#pageCountSelect");
  const binding = state.presets.bindings?.find((b) => b.id === state.bindingId);
  const presets = state.presets.bookletPagePresets || [4, 8, 12, 16, 20, 24, 32];
  const min = binding?.minPages || 4;
  const max = bookPageLimit(state.bindingId);
  const mult = binding?.pageMultiple || 2;
  sel.innerHTML = "";
  const set = new Set(presets.filter((n) => n >= min && n <= max && n % mult === 0));
  set.add(normalizePageCount(state.pageCount, state.bindingId));
  [...set]
    .sort((a, b) => a - b)
    .forEach((n) => {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `${n}페이지`;
      sel.appendChild(opt);
    });
  state.pageCount = normalizePageCount(state.pageCount, state.bindingId);
  sel.value = String(state.pageCount);
}

function updateBindingNote() {
  const b = state.presets.bindings?.find((x) => x.id === state.bindingId);
  $("#bindingNote").textContent = b?.note || "";
}

function updateCustomVisibility() {
  $("#customRow").hidden = state.sizeId !== "custom";
}

function updateBookletCustomVisibility() {
  $("#bookletCustomRow").hidden = state.bookletSizeId !== "custom";
}

function updateDeltaVisibility() {
  const fold = getFold();
  $("#deltaField").hidden = !fold?.innerNarrow;
}

const bookDocuments = {};
const bookDocumentKeys = ["bookletSizeId", "bookletCustomW", "bookletCustomH", "bookletOrient", "bindingId", "pageCount", "pageImages", "spreadIndex", "parentSheetId", "parentCustomW", "parentCustomH", "book"];
function setProductMode(mode, silent, brochure = false) {
  if (state.productMode === "booklet") {
    bookDocuments[state.brochure ? "brochure" : "book"] = Object.fromEntries(bookDocumentKeys.map(k => [k, k === "book" ? { ...state.book } : state[k]]));
  }
  if (mode === "booklet") {
    const saved = bookDocuments[brochure ? "brochure" : "book"];
    const target = saved || { bookletSizeId: "a5", bookletCustomW: 148, bookletCustomH: 210,
      bookletOrient: "portrait", parentSheetId: "auto", parentCustomW: 297, parentCustomH: 420, pageCount: 12,
      pageImages: Array(12).fill(null), spreadIndex: 0, bindingId: brochure ? "saddle_stitch" : "hardcover",
      book: { paperThickness: 0.12, coverThickness: brochure ? 0.25 : 1.5, open: 115, turn: 0.4, front: null, back: null, spine: null } };
    const { book, ...settings } = target;
    Object.assign(state, settings); Object.assign(state.book, book);
    state.brochure = brochure;
    populateSelects(); rebuildBookletPageList();
    state.book3dViewer?.dispose(); state.book3dViewer = null;
    for (const [id, key] of [["bookPaperThickness", "paperThickness"], ["bookCoverThickness", "coverThickness"]]) $("#" + id).value = state.book[key];
    for (const [id, key] of [["bookFront", "front"], ["bookBack", "back"], ["bookSpine", "spine"]]) {
      $("#" + id).value = "";
      $("#" + id + "Status").textContent = state.book[key] ? "이미지 적용됨" : "이미지 없음";
    }
  } else state.brochure = false;
  state.productMode = mode;
  $(".sidebar").scrollTop = 0;
  $$("#modeToggle [data-mode]").forEach((b) =>
    setActive(b, b.dataset.mode === (brochure ? "fold" : mode))
  );
  $("#leafletTypePanel").hidden = mode !== "fold" && !brochure;
  $("#leafletType").value = brochure ? "brochure" : "fold";
  $("#bindingSelect").disabled = brochure;
  $("#panelFold").hidden = mode !== "fold";
  $("#panelBooklet").hidden = mode !== "booklet";
  $("#toolbarFold").hidden = mode !== "fold";
  $("#toolbarBooklet").hidden = mode !== "booklet";
  $("#sideToggle").hidden = mode !== "fold";
  $("#foldAmountControl").hidden = mode === "booklet" && state.viewMode !== "book3d";
  $("#bookletNav").hidden = mode !== "booklet";

  state.viewMode = mode === "fold" ? "orbit3d" : mode === "booklet" ? "book3d" : "studio";

  if (mode === "fold") {
    if (["spread", "flipbook", "thumbs", "book3d"].includes(state.viewMode)) {
      state.viewMode = "flat";
    }
    $("#statsTitle").textContent = "패널 정보";
    if (!silent)
      showBanner("접지 리플렛 모드 — 전개/접힘/3D로 확인", false);
  } else if (mode === "booklet") {
    if (["flat", "folded", "flip", "open", "orbit3d"].includes(state.viewMode)) {
      state.viewMode = "flipbook";
    }
    $("#statsTitle").textContent = "책자 정보";
    if (!silent)
      showBanner(
        brochure ? "책자형 리플렛 · 중철 — 페이지 이미지 또는 PDF를 넣어 보세요. 4페이지는 종이 한 장을 접은 형태예요." : "표지·책등을 따로 넣고 제본과 펼침을 확인해요. 페이지 수는 표지를 포함해요.",
        false
      );
  } else if (!silent) {
    showBanner(mode === "poster" ? "앞·뒷면 이미지를 넣고 포스터를 돌려보세요." : "트러스와 출력물의 앞뒤를 확인해요. 출력물을 숨기면 뒷구조가 잘 보여요.", false);
  }
  updateViewModeButtons();
  renderAll();
}

function bindUI() {
  // Keep the native picker clickable and allow choosing the same file again.
  document.addEventListener("click", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === "file") e.target.value = "";
  }, true);
  $("#leafletType").addEventListener("change", e => setProductMode(e.target.value === "brochure" ? "booklet" : "fold", false, e.target.value === "brochure"));
  $$("#modeToggle [data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setProductMode(btn.dataset.mode));
  });
  $("#btnDemoImages")?.addEventListener("click", () => loadDemoImages());

  $("#sizeSelect").addEventListener("change", (e) => {
    state.sizeId = e.target.value;
    updateCustomVisibility();
    renderAll();
  });
  $("#foldSelect").addEventListener("change", (e) => {
    state.foldId = e.target.value;
    updateDeltaVisibility();
    rebuildPanelUploadSlots();
    updateViewModeButtons();
    renderAll();
  });
  $("#orientSelect").addEventListener("change", (e) => {
    state.orientation = e.target.value;
    renderAll();
  });
  $("#axisSelect").addEventListener("change", (e) => {
    state.foldAxis = e.target.value;
    renderAll();
  });
  $("#customW").addEventListener("input", (e) => {
    state.customW = Number(e.target.value) || 210;
    renderAll();
  });
  $("#customH").addEventListener("input", (e) => {
    state.customH = Number(e.target.value) || 297;
    renderAll();
  });
  $("#deltaRange").addEventListener("input", (e) => {
    state.deltaMm = Number(e.target.value);
    $("#deltaOut").textContent = `${state.deltaMm} mm`;
    renderAll();
  });
  $("#foldAmount").addEventListener("input", (e) => {
    state.foldAmount = Number(e.target.value);
    $("#foldAmountOut").textContent = `${Math.round(state.foldAmount * 100)}%`;
    applyFoldAmountOnly();
  });

  // shop templates
  refreshShopTemplateSelect();
  $("#btnSaveShopTpl")?.addEventListener("click", () => {
    const name =
      $("#shopTemplateName")?.value?.trim() ||
      `템플릿 δ${state.deltaMm}mm`;
    upsertTemplate({
      name,
      deltaMm: state.deltaMm,
      notes: "",
      sizeId: state.sizeId,
      foldId: state.foldId,
    });
    refreshShopTemplateSelect();
    showBanner(`인쇄소 템플릿 저장: ${name} (δ=${state.deltaMm}mm)`, false);
  });
  $("#btnDelShopTpl")?.addEventListener("click", () => {
    const id = $("#shopTemplateSelect")?.value;
    if (!id) return;
    deleteTemplate(id);
    refreshShopTemplateSelect();
    showBanner("템플릿 삭제됨", false);
  });
  $("#shopTemplateSelect")?.addEventListener("change", (e) => {
    const id = e.target.value;
    if (!id) return;
    const t = getTemplate(id);
    if (!t) return;
    state.deltaMm = t.deltaMm;
    $("#deltaRange").value = t.deltaMm;
    $("#deltaOut").textContent = `${t.deltaMm} mm`;
    if (t.foldId) {
      state.foldId = t.foldId;
      $("#foldSelect").value = t.foldId;
      updateDeltaVisibility();
    }
    if (t.sizeId && t.sizeId !== "custom") {
      state.sizeId = t.sizeId;
      $("#sizeSelect").value = t.sizeId;
      updateCustomVisibility();
    }
    renderAll();
    showBanner(`템플릿 적용: ${t.name}`, false);
  });
  $("#btnExportShopJson")?.addEventListener("click", () => {
    downloadTemplatesJson(
      `shop-templates-${new Date().toISOString().slice(0, 10)}.json`
    );
    showBanner("템플릿 JSON 내보내기 완료", false);
  });
  $("#shopImportFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const mode = $("#shopImportMode")?.value || "merge";
      const res = await importTemplatesFromFile(file, mode);
      refreshShopTemplateSelect();
      $("#shopImportLabel")?.classList.add("has-file");
      showBanner(
        `템플릿 ${res.imported}개 가져옴 (총 ${res.total}개, ${mode})`,
        false
      );
    } catch (err) {
      showBanner(`JSON 가져오기 실패: ${err.message}`, true);
    }
    e.target.value = "";
  });

  // export fold
  $("#btnExportFoldPng")?.addEventListener("click", () => exportFold("png"));
  $("#btnExportFoldPdf")?.addEventListener("click", () => exportFold("pdf"));
  $("#btnExportImpPng")?.addEventListener("click", () => exportImposition("png"));
  $("#btnExportImpPdf")?.addEventListener("click", () => exportImposition("pdf"));

  // PDF import
  $("#foldPdf")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showBanner("PDF 읽는 중…", false);
      const imgs = await pdfToImages(file, { maxPages: 2, scale: 1.4, allowTruncate: true });
      if (imgs[0]) {
        state.frontImage = imgs[0];
        $("#frontFileLabel").classList.add("has-file");
        $("#frontFileLabel").firstChild.textContent = "PDF p1";
      }
      if (imgs[1]) {
        state.backImage = imgs[1];
        $("#backFileLabel").classList.add("has-file");
        $("#backFileLabel").firstChild.textContent = "PDF p2";
      }
      $("#foldPdfLabel")?.classList.add("has-file");
      showBanner(`PDF에서 ${imgs.length}쪽 추출 (앞·뒤)`, false);
      renderAll();
    } catch (err) {
      showBanner(`PDF 실패: ${err.message}`, true);
    }
  });

  $("#bookletPdf")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const includesCovers = $("#bookImportMode").value === "covers";
    e.target.disabled = true;
    try {
      const prog = $("#pdfProgress");
      if (prog) prog.textContent = "PDF 변환 중…";
      showBanner("PDF 페이지 분리 중…", false);
      const imgs = await pdfToImages(file, {
        maxPages: bookPageLimit(state.bindingId) - (includesCovers ? 0 : 2),
        scale: 1.35,
        onProgress: (done, total) => {
          if (prog) prog.textContent = `${done} / ${total} 쪽 변환…`;
        },
      });
      const imported = assembleBookPages(imgs, includesCovers, state.bindingId);
      state.pageCount = imported.length;
      state.pageImages = imported;
      refillPageCountSelect();
      ensurePageArray();
      rebuildBookletPageList();
      $("#bookletPdfLabel")?.classList.add("has-file");
      if (prog) prog.textContent = `${imgs.length}쪽 적용 (책 ${state.pageCount}p)`;
      showBanner(`PDF ${imgs.length}쪽 → 책자 ${state.pageCount}p`, false);
      state.spreadIndex = 0;
      renderAll();
    } catch (err) {
      showBanner(`PDF 실패: ${err.message}`, true);
      const prog = $("#pdfProgress");
      if (prog) prog.textContent = err.message;
    } finally {
      e.target.value = "";
      e.target.disabled = false;
    }
  });

  $$("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.viewMode = btn.dataset.view;
      updateViewModeButtons();
      $("#foldAmountControl").hidden =
        state.productMode === "booklet" && state.viewMode !== "book3d";
      $("#bookletNav").hidden =
        state.productMode !== "booklet" ||
        !["spread", "flipbook"].includes(state.viewMode);
      renderAll();
    });
  });

  $$("[data-side]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.showSide = btn.dataset.side;
      $$("[data-side]").forEach((b) =>
        setActive(b, b.dataset.side === state.showSide)
      );
      renderAll();
    });
  });

  bindFile("#frontFile", "front");
  bindFile("#backFile", "back");

  $("#clearImages").addEventListener("click", () => {
    state.frontImage = null;
    state.backImage = null;
    state.panelImages = {};
    $("#frontFileLabel").classList.remove("has-file");
    $("#frontFileLabel").firstChild.textContent = "종이 A면 이미지 선택";
    $("#backFileLabel").classList.remove("has-file");
    $("#backFileLabel").firstChild.textContent = "종이 B면 이미지 선택";
    $("#frontFile").value = ""; $("#backFile").value = "";
    rebuildPanelUploadSlots();
    renderAll();
  });

  // booklet
  $("#bookletSizeSelect").addEventListener("change", (e) => {
    state.bookletSizeId = e.target.value;
    updateBookletCustomVisibility();
    refreshParentSheetUI();
    renderAll();
  });
  $("#bindingSelect").addEventListener("change", (e) => {
    const wasHard = ["hardcover", "round_hardcover"].includes(state.bindingId);
    state.bindingId = e.target.value;
    if (wasHard !== ["hardcover", "round_hardcover"].includes(state.bindingId)) {
      state.book.coverThickness = wasHard ? 0.25 : 1.5;
      $("#bookCoverThickness").value = state.book.coverThickness;
    }
    updateBindingNote();
    state.pageCount = normalizePageCount(state.pageCount, state.bindingId);
    refillPageCountSelect();
    ensurePageArray();
    rebuildBookletPageList();
    state.spreadIndex = 0;
    updateParentSheetFieldVisibility();
    updateViewModeButtons();
    renderAll();
  });
  $("#pageCountSelect").addEventListener("change", (e) => {
    state.pageCount = normalizePageCount(
      Number(e.target.value),
      state.bindingId
    );
    ensurePageArray();
    rebuildBookletPageList();
    state.spreadIndex = 0;
    renderAll();
  });
  $("#bookletOrient").addEventListener("change", (e) => {
    state.bookletOrient = e.target.value;
    refreshParentSheetUI();
    renderAll();
  });
  $("#bookletCustomW").addEventListener("input", (e) => {
    state.bookletCustomW = Number(e.target.value) || 148;
    refreshParentSheetUI();
    renderAll();
  });
  $("#bookletCustomH").addEventListener("input", (e) => {
    state.bookletCustomH = Number(e.target.value) || 210;
    refreshParentSheetUI();
    renderAll();
  });
  $("#parentSheetSelect")?.addEventListener("change", (e) => {
    state.parentSheetId = e.target.value;
    $("#parentCustomRow").hidden = state.parentSheetId !== "custom";
    renderAll();
  });
  $("#parentCustomW")?.addEventListener("input", (e) => {
    state.parentCustomW = Number(e.target.value) || 297;
    renderAll();
  });
  $("#parentCustomH")?.addEventListener("input", (e) => {
    state.parentCustomH = Number(e.target.value) || 420;
    renderAll();
  });

  $("#bookletBulk").addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    try {
    const max = bookPageLimit(state.bindingId) - ($("#bookImportMode").value === "covers" ? 0 : 2);
    if (files.length > max) throw new Error(`최대 ${max}장까지 넣을 수 있어요.`);
    const imgs = await Promise.all(files.map(loadImageFile));
    state.pageImages = assembleBookPages(imgs, $("#bookImportMode").value === "covers", state.bindingId);
    state.pageCount = state.pageImages.length;
    refillPageCountSelect();
    state.spreadIndex = 0;
    $("#bookletBulkLabel").classList.add("has-file");
    $("#bookletBulkLabel").childNodes[0].textContent = `${Math.min(
      imgs.length,
      state.pageCount
    )}장 적용됨 · 다시 올리기`;
    rebuildBookletPageList();
    renderAll();
    } catch (err) { showBanner(`이미지 불러오기 실패: ${err.message}`, true); }
    finally { e.target.value = ""; }
  });

  $("#clearBookletImages").addEventListener("click", () => {
    state.pageImages = Array(state.pageCount).fill(null);
    $("#bookletBulk").value = ""; $("#bookletPdf").value = "";
    $("#pdfProgress").textContent = "";
    $("#bookletBulkLabel").classList.remove("has-file");
    $("#bookletBulkLabel").childNodes[0].textContent =
      "여러 장 한 번에 올리기 (순서대로 1→N)";
    rebuildBookletPageList();
    renderAll();
  });

  $("#btnPrevSpread").addEventListener("click", () => {
    if (state.viewMode === "flipbook" && state.curlBook) {
      state.curlBook.step("prev");
      return;
    }
    state.spreadIndex = Math.max(0, state.spreadIndex - 1);
    renderAll();
  });
  $("#btnNextSpread").addEventListener("click", () => {
    if (state.viewMode === "flipbook" && state.curlBook) {
      state.curlBook.step("next");
      return;
    }
    const spreads = buildSpreads(state.pageCount);
    state.spreadIndex = Math.min(spreads.length - 1, state.spreadIndex + 1);
    renderAll();
  });
}

function bindFile(inputSel, which) {
  const input = $(inputSel);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    let img;
    try { img = await loadImageFile(file); }
    catch { showBanner("이미지를 읽지 못했어요. 다른 이미지 파일을 선택해 주세요.", true); return; }
    if (which === "front") {
      state.frontImage = img;
      $("#frontFileLabel").classList.add("has-file");
      $("#frontFileLabel").firstChild.textContent = file.name;
    } else {
      state.backImage = img;
      $("#backFileLabel").classList.add("has-file");
      $("#backFileLabel").firstChild.textContent = file.name;
    }
    renderAll();
  });
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("지원하지 않는 이미지예요."));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function rebuildPanelUploadSlots() {
  const fold = getFold();
  const box = $("#panelUploads");
  if (!fold || !box) return;
  box.innerHTML = "";
  for (let i = 0; i < fold.panelCount; i++) {
    ["front", "back"].forEach((side) => {
      const key = `${side}-${i}`;
      const row = document.createElement("div");
      row.className = "panel-upload-row";
      const span = document.createElement("span");
      span.textContent = foldFaceLabel(state.foldId, side, i);
      const label = document.createElement("label");
      label.className = "file-btn";
      label.style.minHeight = "1.9rem";
      label.style.fontSize = "0.72rem";
      label.textContent = state.panelImages[key] ? "교체" : "없음";
      if (state.panelImages[key]) label.classList.add("has-file");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.setAttribute("aria-label", `${foldFaceLabel(state.foldId, side, i)} 이미지 선택`);
      input.addEventListener("change", async () => {
        const f = input.files?.[0];
        if (!f) return;
        try { state.panelImages[key] = await loadImageFile(f); }
        catch { showBanner("이미지를 읽지 못했어요. PNG 또는 JPG 파일을 선택해 주세요.", true); return; }
        label.firstChild.textContent = "적용됨";
        label.classList.add("has-file");
        renderAll();
      });
      label.appendChild(input);
      row.append(span, label);
      box.appendChild(row);
    });
  }
}

function rebuildBookletPageList() {
  const box = $("#bookletPageList");
  if (!box) return;
  ensurePageArray();
  box.innerHTML = "";
  for (let i = 0; i < state.pageCount; i++) {
    const row = document.createElement("div");
    row.className = "panel-upload-row";
    const span = document.createElement("span");
    span.textContent = pageLabel(i, state.pageCount);
    const label = document.createElement("label");
    label.className = "file-btn";
    label.style.minHeight = "1.9rem";
    label.style.fontSize = "0.72rem";
    label.textContent = bookImage(i) ? "교체" : "없음";
    if (bookImage(i)) label.classList.add("has-file");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("aria-label", `${pageLabel(i, state.pageCount)} 페이지 이미지 선택`);
    const idx = i;
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      if (!f) return;
      try { state.pageImages[idx] = await loadImageFile(f); }
      catch { showBanner("이미지를 읽지 못했어요. PNG 또는 JPG 파일을 선택해 주세요.", true); return; }
      if (idx === 0) { state.book.front = null; $("#bookFrontStatus").textContent = "페이지 목록 이미지 사용"; }
      if (idx === state.pageCount - 1) { state.book.back = null; $("#bookBackStatus").textContent = "페이지 목록 이미지 사용"; }
      label.firstChild.textContent = "적용됨";
      label.classList.add("has-file");
      renderAll();
    });
    label.appendChild(input);
    row.append(span, label);
    box.appendChild(row);
  }
}

function updateViewModeButtons() {
  if (["poster", "photozone"].includes(state.productMode)) return;
  if (state.productMode === "fold") {
    const fold = getFold();
    const allowed = new Set(fold?.viewModes || ["flat", "folded", "orbit3d"]);
    $$("#toolbarFold [data-view]").forEach((btn) => {
      const v = btn.dataset.view;
      let ok = true;
      if (v === "flip") ok = allowed.has("book_flip") || fold?.id === "half";
      if (v === "open")
        ok =
          allowed.has("sequential_open") ||
          allowed.has("accordion") ||
          fold?.id === "cfold3" ||
          fold?.id === "zfold3";
      btn.disabled = !ok;
      setActive(btn, state.viewMode === v);
    });
  } else {
    $$("#toolbarBooklet [data-view]").forEach((btn) => {
      const v = btn.dataset.view;
      let ok = true;
      if (v === "imposition") ok = state.bindingId === "saddle_stitch";
      // printguide works for all bindings
      btn.disabled = !ok;
      setActive(btn, state.viewMode === v);
    });
    if (
      state.viewMode === "imposition" &&
      state.bindingId !== "saddle_stitch"
    ) {
      state.viewMode = "printguide";
    }
  }
}

function refreshShopTemplateSelect() {
  const sel = $("#shopTemplateSelect");
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = `<option value="">— 선택 —</option>`;
  listTemplates().forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.name} (δ${t.deltaMm}mm)`;
    sel.appendChild(opt);
  });
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function exportFold(kind) {
  const data = getSheetAndPanels();
  if (!data) return;
  try {
    const canvas = renderFoldFlatCanvas({
      sheet: data.sheet,
      panels: data.panels,
      foldAxis: state.foldAxis,
      frontImage: state.frontImage,
      backImage: state.backImage,
      panelImages: state.panelImages,
      foldLabel: data.fold.label,
      sizeLabel: data.size.labelDetail || data.size.label,
    });
    const base = `leaflet-flat-${data.size.id}-${data.fold.id}`;
    if (kind === "png") {
      downloadCanvasPng(canvas, `${base}.png`);
      showBanner("전개도 PNG 저장", false);
    } else {
      downloadCanvasesPdf([canvas], `${base}.pdf`).then(() =>
        showBanner("전개도 PDF 저장", false)
      );
    }
  } catch (err) {
    showBanner(`내보내기 실패: ${err.message}`, true);
  }
}

function exportImposition(kind) {
  if (state.bindingId !== "saddle_stitch") {
    showBanner("임포지션 내보내기는 중철 제본에서만 가능합니다.", true);
    return;
  }
  try {
    const page = getBookletPageSize();
    const imp = buildSaddleImposition(state.pageCount);
    if (kind === "png") {
      const canvas = renderImpositionCanvas({
        pageSize: page,
        imposition: imp,
        pageImages: bookImages(),
        pageCount: state.pageCount,
      });
      downloadCanvasPng(canvas, `imposition-${state.pageCount}p.png`);
      showBanner("임포지션 PNG 저장", false);
    } else {
      const canvases = renderImpositionSheetCanvases({
        pageSize: page,
        imposition: imp,
        pageImages: bookImages(),
        pageCount: state.pageCount,
      });
      downloadCanvasesPdf(canvases, `imposition-${state.pageCount}p.pdf`).then(
        () => showBanner("임포지션 PDF 저장 (시트별 페이지)", false)
      );
    }
  } catch (err) {
    showBanner(`임포지션 내보내기 실패: ${err.message}`, true);
  }
}

function stageBox() {
  const wrap = $(".stage-wrap");
  return { w: wrap.clientWidth || 800, h: wrap.clientHeight || 500 };
}

function renderAll() {
  $("#sideToggle").hidden = state.productMode !== "fold" || state.viewMode !== "folded";
  studio?.sync();
  if (["poster", "photozone"].includes(state.productMode)) {
    try { studio.renderExtra(); } catch (err) { showBanner(`3D 표시 실패: ${err.message}`, true); }
    return;
  }
  if (state.productMode === "booklet") {
    renderBooklet();
    return;
  }
  const data = getSheetAndPanels();
  if (!data) return;
  updateFoldStats(data);
  updateViewModeButtons();

  $$(".stage").forEach((s) => s.classList.remove("active"));
  const stageId = {
    flat: "view-flat",
    folded: "view-folded",
    flip: "view-flip",
    open: "view-open",
    orbit3d: "view-3d",
  }[state.viewMode];
  $(`#${stageId}`)?.classList.add("active");

  if (state.viewMode === "flat") renderFlat(data);
  else if (state.viewMode === "folded") renderFolded(data);
  else if (state.viewMode === "flip") renderFlip(data);
  else if (state.viewMode === "open") renderOpen(data);
  else if (state.viewMode === "orbit3d") render3d(data);
}

/* ---------------- fold stats / views (existing) ---------------- */

function updateFoldStats(data) {
  const { sheet, fold, panels, finished } = data;
  const widths = panels.map((p) =>
    state.foldAxis === "horizontal" ? p.height : p.width
  );
  $("#stats").innerHTML = `
    <div><strong>전개</strong> ${sheet.widthMm} × ${sheet.heightMm} mm</div>
    <div><strong>접지</strong> ${fold.label} · ${fold.panelCount}패널 · ${fold.totalSides}P</div>
    <div><strong>완성(대략)</strong> ${finished.widthMm} × ${finished.heightMm} mm</div>
    <div><strong>알고리즘</strong> ${fold.algorithm}</div>
    <div>${foldCovers(fold.id).map(f => foldFaceLabel(fold.id, f.side, f.index)).join(" / ")}</div>
    <div>표지는 현재 시뮬레이터의 접는 순서 기준이에요.</div>
  `;
  $("#widthChips").innerHTML = widths
    .map((w, i) => `<span class="chip">P${i + 1}: ${w}mm</span>`)
    .join("");
}

function panelBackground(side, index, panels, sheet) {
  const key = `${side}-${index}`;
  if (state.panelImages[key]) {
    return {
      has: true,
      style: {
        backgroundImage: `url(${state.panelImages[key].src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      },
    };
  }
  const img = side === "front" ? state.frontImage : state.backImage;
  if (!img) return { has: false, style: {} };
  const p = panels[index];
  const x = side === "back" ? sheet.widthMm - p.x - p.width : p.x;
  const xp = sheet.widthMm === p.width ? 0 : x / (sheet.widthMm - p.width) * 100;
  const yp = sheet.heightMm === p.height ? 0 : p.y / (sheet.heightMm - p.height) * 100;
  return {
    has: true,
    style: {
      backgroundImage: `url(${img.src})`,
      backgroundSize: `${sheet.widthMm / p.width * 100}% ${sheet.heightMm / p.height * 100}%`,
      backgroundPosition: `${xp}% ${yp}%`,
    },
  };
}

function renderFlat(data) {
  const { sheet, panels } = data;
  const box = stageBox();
  const scale = mmToScale(sheet.widthMm, sheet.heightMm * 2 + 20, box.w, box.h, 40);
  const host = $("#flatHost");
  host.innerHTML = "";
  const makeSheet = (side, label) => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.style.marginBottom = "1.6rem";
    const lab = document.createElement("div");
    lab.className = "sheet-label";
    lab.textContent = label;
    const sheetEl = document.createElement("div");
    sheetEl.className = "sheet";
    sheetEl.style.width = `${sheet.widthMm * scale}px`;
    sheetEl.style.height = `${sheet.heightMm * scale}px`;
    sheetEl.style.position = "relative";
    panels.forEach((p, i) => {
      const elp = document.createElement("div");
      elp.className = "panel";
      elp.style.position = "absolute";
      elp.style.left = `${(side === "back" ? sheet.widthMm - p.x - p.width : p.x) * scale}px`;
      elp.style.top = `${p.y * scale}px`;
      elp.style.width = `${p.width * scale}px`;
      elp.style.height = `${p.height * scale}px`;
      elp.style.border = "1px dashed rgba(240,180,41,0.6)";
      const bg = panelBackground(side, i, panels, sheet);
      if (bg.has) {
        elp.classList.add("has-image");
        Object.assign(elp.style, bg.style);
      }
      elp.innerHTML = `<span class="idx">${foldFaceLabel(state.foldId, side, i)}</span><div class="placeholder">패널 ${i + 1}<br>${(
        state.foldAxis === "vertical" ? p.width : p.height
      ).toFixed(1)} mm</div>`;
      sheetEl.appendChild(elp);
    });
    wrap.append(lab, sheetEl);
    return wrap;
  };
  host.appendChild(makeSheet("front", "종이 A면 전개도"));
  host.appendChild(makeSheet("back", "종이 B면 전개도 · 좌우로 뒤집어 본 모습"));
}

function renderFolded(data) {
  const { finished, panels, sheet } = data;
  const box = stageBox();
  const scale = mmToScale(finished.widthMm, finished.heightMm, box.w, box.h, 48);
  const host = $("#foldedHost");
  host.innerHTML = "";
  const card = document.createElement("div");
  card.className = "finished-card";
  card.style.width = `${finished.widthMm * scale}px`;
  card.style.height = `${finished.heightMm * scale}px`;
  const cover = foldCovers(state.foldId)[state.showSide === "front" ? 0 : 1];
  const bg = panelBackground(cover.side, cover.index, panels, sheet);
  if (bg.has) Object.assign(card.style, bg.style);
  else card.innerHTML = `<div class="placeholder">${foldFaceLabel(state.foldId, cover.side, cover.index)}<br>${finished.widthMm} × ${finished.heightMm} mm</div>`;
  const dims = document.createElement("div");
  dims.className = "finished-dims";
  dims.textContent = `완성 크기(대략) ${finished.widthMm} × ${finished.heightMm} mm`;
  const wrap = document.createElement("div");
  wrap.className = "finished-box";
  wrap.append(card, dims);
  host.appendChild(wrap);
}

function applyFaceBg(elp, side, index, panels, sheet) {
  const bg = panelBackground(side, index, panels, sheet);
  if (bg.has) Object.assign(elp.style, bg.style);
  else elp.style.background = index % 2 ? "#e8ecf4" : "#f4f6fa";
}

function renderFlip(data) {
  const { sheet, panels } = data;
  const box = stageBox();
  const pw = panels[0]?.width || sheet.widthMm / 2;
  const ph = sheet.heightMm;
  const scale = mmToScale(pw, ph, box.w * 0.7, box.h * 0.75, 20);
  const host = $("#flipHost");
  host.innerHTML = "";
  const book = document.createElement("div");
  book.className = "book";
  book.id = "bookRoot";
  book.style.width = `${pw * scale}px`;
  book.style.height = `${ph * scale}px`;
  const page = document.createElement("div");
  page.className = "book-page";
  const front = document.createElement("div");
  front.className = "face front";
  applyFaceBg(front, "front", 0, panels, sheet);
  const back = document.createElement("div");
  back.className = "face back";
  applyFaceBg(back, "front", Math.min(1, panels.length - 1), panels, sheet);
  page.append(front, back);
  const under = document.createElement("div");
  under.style.cssText =
    "position:absolute;inset:0;background:#fff;border-radius:2px;box-shadow:var(--shadow);background-size:cover;z-index:0;";
  applyFaceBg(under, "back", 0, panels, sheet);
  book.append(under, page);
  page.style.zIndex = "1";
  const hint = document.createElement("div");
  hint.className = "book-hint";
  hint.innerHTML = `이단 책 넘기기 · <button type="button" id="flipBookBtn">넘기기 / 덮기</button>`;
  host.append(book, hint);
  $("#flipBookBtn")?.addEventListener("click", () =>
    book.classList.toggle("flipped")
  );
}

function renderOpen(data) {
  const { sheet, panels, fold } = data;
  const box = stageBox();
  const scale = mmToScale(sheet.widthMm, sheet.heightMm, box.w * 0.9, box.h * 0.75, 32);
  const host = $("#openHost");
  host.innerHTML = "";
  const strip = document.createElement("div");
  strip.className = "fold-strip";
  strip.style.height = `${sheet.heightMm * scale}px`;
  const t = state.foldAmount;
  const maxDeg = 165;
  const isZ = fold.id === "zfold3" || fold.id === "accordion4";
  let parent = strip;
  panels.forEach((p, i) => {
    const seg = document.createElement("div");
    seg.className = "fold-seg";
    seg.style.width = `${p.width * scale}px`;
    seg.style.height = "100%";
    if (i > 0) {
      let sign = 1;
      if (isZ) sign = i % 2 === 1 ? 1 : -1;
      seg.style.transform = `rotateY(${-sign * t * maxDeg}deg)`;
    }
    const face = document.createElement("div");
    face.className = "face";
    face.style.width = "100%";
    face.style.height = "100%";
    const bg = panelBackground("front", i, panels, sheet);
    if (bg.has) Object.assign(face.style, bg.style);
    face.innerHTML = `<span class="idx">F${i + 1}</span>`;
    seg.appendChild(face);
    parent.appendChild(seg);
    parent = seg;
  });
  host.appendChild(strip);
}

function render3d(data) {
  const host = $("#view3dInner");
  if (!state.viewer3d) {
    try {
      // clear hint only once — keep structure
      state.viewer3d = new Leaflet3DViewer(host);
    } catch (e) {
      host.innerHTML = `<p style="color:#f07178;padding:1rem">3D 로드 실패: ${e.message}</p>`;
      return;
    }
  }
  state.viewer3d.resize();
  state.viewer3d.build({
    panels: data.panels,
    foldId: data.fold.id,
    foldAxis: state.foldAxis,
    frontImage: state.frontImage,
    backImage: state.backImage,
    panelImages: state.panelImages,
  });
  state.viewer3d.applyFold(state.foldAmount);
}

function applyFoldAmountOnly() {
  if (state.productMode === "fold") {
    if (state.viewMode === "orbit3d" && state.viewer3d) {
      state.viewer3d.applyFold(state.foldAmount);
    } else if (state.viewMode === "open") {
      const data = getSheetAndPanels();
      if (data) renderOpen(data);
    }
  }
}

/* ---------------- booklet mode ---------------- */

function getBookletSpreadsForCurl() {
  const spreads = buildSpreads(state.pageCount);
  return spreads.map((sp) => {
    const leftUrl =
      sp.left != null && bookImage(sp.left)
        ? bookImage(sp.left).src
        : null;
    const rightUrl =
      sp.right != null && bookImage(sp.right)
        ? bookImage(sp.right).src
        : null;
    return {
      leftUrl,
      rightUrl,
      label: sp.label,
    };
  });
}

function updateBookletStats() {
  const page = getBookletPageSize();
  const binding = state.presets.bindings?.find((b) => b.id === state.bindingId);
  const est = estimateSheets(state.pageCount, state.bindingId);
  const filled = bookImages().filter(Boolean).length;
  const spreads = buildSpreads(state.pageCount);
  let parentLine = "";
  if (state.bindingId === "saddle_stitch") {
    const r = getParentSheetResolved();
    parentLine = `<div><strong>부모 용지</strong> ${r.parent.label} ${r.parent.widthMm}×${r.parent.heightMm} mm · 필요 ${r.need.widthMm}×${r.need.heightMm} · ${r.fits ? "OK" : "여유↓"}</div>`;
  }
  $("#stats").innerHTML = `
    <div><strong>페이지</strong> ${page.widthMm} × ${page.heightMm} mm · ${state.pageCount}p</div>
    <div><strong>제본</strong> ${binding?.label || state.bindingId}</div>
    ${parentLine}
    <div><strong>스프레드</strong> ${spreads.length}개</div>
    <div><strong>이미지</strong> ${filled} / ${state.pageCount}</div>
    <div class="credit-note">${est.note}</div>
    <div class="credit-note">플립 곡선 참고: MengTo/sketchbook</div>
  `;
  $("#widthChips").innerHTML = `<span class="chip">${state.bookletOrient}</span><span class="chip">${binding?.labelEn || ""}</span>`;
  $("#spreadOut").textContent = `${state.spreadIndex + 1} / ${spreads.length}`;
}

function renderBooklet() {
  ensurePageArray();
  updateBookletStats();
  updateViewModeButtons();
  $$(".stage").forEach((s) => s.classList.remove("active"));
  const map = {
    spread: "view-spread",
    flipbook: "view-flipbook",
    thumbs: "view-thumbs",
    imposition: "view-imposition",
    printguide: "view-printguide",
    book3d: "view-book3d",
  };
  $(`#${map[state.viewMode] || "view-flipbook"}`)?.classList.add("active");

  $("#bookletNav").hidden = !["spread", "flipbook"].includes(state.viewMode);
  $("#foldAmountControl").hidden = true;
  refreshParentSheetUI();

  if (state.viewMode === "spread") renderBookletSpread();
  else if (state.viewMode === "flipbook") renderBookletFlipbook();
  else if (state.viewMode === "thumbs") renderBookletThumbs();
  else if (state.viewMode === "imposition") renderImposition();
  else if (state.viewMode === "printguide") renderPrintGuide();
  else if (state.viewMode === "book3d") renderBooklet3d();
}

function renderPrintGuide() {
  const host = $("#printGuideHost");
  if (!host) return;
  host.innerHTML = "";
  const page = getBookletPageSize();
  const binding = state.presets.bindings?.find((b) => b.id === state.bindingId);

  const intro = document.createElement("div");
  intro.className = "imposition-intro";
  intro.innerHTML = `<strong>인쇄 · 페이지 순서 가이드</strong> · ${binding?.label || state.bindingId} · ${state.pageCount}p · 완성 ${page.widthMm}×${page.heightMm} mm`;
  host.appendChild(intro);

  if (state.bindingId === "saddle_stitch") {
    const r = getParentSheetResolved();
    const box = document.createElement("div");
    box.className = "imposition-sheet";
    box.innerHTML = `
      <div class="imposition-title">중철 · 부모 용지 매핑</div>
      <p class="hint" style="margin:0 0 0.5rem">완성 페이지를 좌우 2up으로 올린 뒤 가운데 접어 중철합니다.</p>
      <div class="stats">
        <div><strong>필요 전개</strong> ${r.need.widthMm} × ${r.need.heightMm} mm</div>
        <div><strong>부모 용지</strong> ${r.parent.label} ${r.parent.widthMm} × ${r.parent.heightMm} mm (${r.source})</div>
        <div><strong>적합</strong> ${r.fits ? "예 — 표준지에 들어감" : "아니오 — 여백·재단 또는 더 큰 용지"}</div>
        <div class="credit-note">${r.suggestion.reason}</div>
      </div>
    `;
    if (r.suggestion.alternatives?.length) {
      const ul = document.createElement("div");
      ul.className = "panel-widths";
      ul.style.marginTop = "0.5rem";
      r.suggestion.alternatives.forEach((a) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = `${a.label} ${a.widthMm}×${a.heightMm}`;
        ul.appendChild(chip);
      });
      box.appendChild(ul);
    }
    host.appendChild(box);

    try {
      const imp = buildSaddleImposition(state.pageCount);
      const sheetBox = document.createElement("div");
      sheetBox.className = "imposition-sheet";
      sheetBox.innerHTML = `<div class="imposition-title">시트 인쇄 순서 (바깥→안)</div>`;
      const table = document.createElement("div");
      table.className = "guide-table";
      imp.forEach((s) => {
        const row = document.createElement("div");
        row.className = "guide-row";
        row.innerHTML = `<span>${s.sheetLabel}</span><span>앞 ${formatSide(s.front, state.pageCount)}</span><span>뒤 ${formatSide(s.back, state.pageCount)}</span>`;
        table.appendChild(row);
      });
      sheetBox.appendChild(table);
      host.appendChild(sheetBox);
    } catch (err) {
      host.innerHTML += `<p class="book-hint" style="color:#f07178">${err.message}</p>`;
    }
    return;
  }

  // Perfect bound / spiral
  const leaves = buildPerfectBoundLeaves(state.pageCount);
  const reader = buildReaderOrder(state.pageCount);

  const how = document.createElement("div");
  how.className = "imposition-sheet";
  how.innerHTML = `
    <div class="imposition-title">${binding?.label || "무선/링"} · 인쇄 방식</div>
    <p class="hint" style="margin:0">
      한 장(리프)의 <strong>앞면 = 홀수 페이지</strong>, <strong>뒷면 = 짝수 페이지</strong>로 양면 인쇄한 뒤
      ${state.bindingId === "spiral" ? "링·스프링으로 제본" : "등(spine)에 풀로 무선 제본"}합니다.
      중철처럼 페이지를 교차 배치하지 않습니다.
    </p>
  `;
  host.appendChild(how);

  const leafBox = document.createElement("div");
  leafBox.className = "imposition-sheet";
  leafBox.innerHTML = `<div class="imposition-title">리프(장) 배치 · 총 ${leaves.length}장</div>`;
  const leafTable = document.createElement("div");
  leafTable.className = "guide-table";
  leaves.forEach((L) => {
    const row = document.createElement("div");
    row.className = "guide-row";
    const f = L.front != null ? `${L.front + 1}p` : "—";
    const b = L.back != null ? `${L.back + 1}p` : "—";
    row.innerHTML = `<span>${L.leafLabel}</span><span>앞 ${f}</span><span>뒤 ${b}</span><span class="muted">${L.readerNote}</span>`;
    leafTable.appendChild(row);
  });
  leafBox.appendChild(leafTable);
  host.appendChild(leafBox);

  const readBox = document.createElement("div");
  readBox.className = "imposition-sheet";
  readBox.innerHTML = `<div class="imposition-title">읽는 순서 (1 → ${state.pageCount})</div>`;
  const chips = document.createElement("div");
  chips.className = "panel-widths";
  reader.forEach((r) => {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = `${r.pageNum} ${r.role}`;
    chips.appendChild(c);
  });
  readBox.appendChild(chips);
  host.appendChild(readBox);
}

function renderImposition() {
  const host = $("#impositionHost");
  if (!host) return;
  host.innerHTML = "";

  if (state.bindingId !== "saddle_stitch") {
    host.innerHTML =
      `<p class="book-hint">임포지션 전개도는 <strong>중철 제본</strong>에서만 표시됩니다. 무선·링은 «인쇄 가이드»를 보세요.</p>`;
    return;
  }

  let imp;
  try {
    imp = buildSaddleImposition(state.pageCount);
  } catch (err) {
    host.innerHTML = `<p class="book-hint" style="color:#f07178">${err.message}</p>`;
    return;
  }

  const page = getBookletPageSize();
  const box = stageBox();
  const openW = page.widthMm * 2;
  const scale = mmToScale(openW, page.heightMm, box.w * 0.88, box.h * 0.28, 16);
  const parentR = getParentSheetResolved();

  const intro = document.createElement("div");
  intro.className = "imposition-intro";
  intro.innerHTML = `
    <strong>중철 임포지션</strong> · ${state.pageCount}페이지 · 시트 ${imp.length}장
    <span class="credit-note"> · 부모 ${parentR.parent.label} ${parentR.parent.widthMm}×${parentR.parent.heightMm} mm (필요 ${parentR.need.widthMm}×${parentR.need.heightMm}) · ${parentR.fits ? "적합" : "여유 확인"}</span>
  `;
  host.appendChild(intro);

  imp.forEach((sheet) => {
    const block = document.createElement("div");
    block.className = "imposition-sheet";

    const title = document.createElement("div");
    title.className = "imposition-title";
    title.textContent = `${sheet.sheetLabel} — 앞 ${formatSide(sheet.front, state.pageCount)}  /  뒤 ${formatSide(sheet.back, state.pageCount)}`;
    block.appendChild(title);

    ["front", "back"].forEach((face) => {
      const side = sheet[face];
      const faceLab = document.createElement("div");
      faceLab.className = "imposition-face-label";
      faceLab.textContent = face === "front" ? "앞면 (인쇄면 A)" : "뒷면 (인쇄면 B)";
      block.appendChild(faceLab);

      const row = document.createElement("div");
      row.className = "imposition-row";
      [side.left, side.right].forEach((pi) => {
        const cell = document.createElement("div");
        cell.className =
          "spread-page" + (bookImage(pi) ? "" : " empty");
        cell.style.width = `${page.widthMm * scale}px`;
        cell.style.height = `${page.heightMm * scale}px`;
        if (bookImage(pi)) {
          cell.style.backgroundImage = `url(${bookImage(pi).src})`;
          cell.style.backgroundSize = "cover";
          cell.style.backgroundPosition = "center";
        } else {
          cell.textContent = `${pi + 1}`;
        }
        cell.innerHTML += `<span class="pg-num">${pi + 1}p</span>`;
        row.appendChild(cell);
      });
      // center crease mark
      row.style.position = "relative";
      block.appendChild(row);
    });

    host.appendChild(block);
  });
}

function renderBookletSpread() {
  const page = getBookletPageSize();
  const spreads = buildSpreads(state.pageCount);
  state.spreadIndex = Math.min(state.spreadIndex, spreads.length - 1);
  const sp = spreads[state.spreadIndex];
  const box = stageBox();
  // open spread ≈ 2 pages wide
  const openW = page.widthMm * (sp.left != null && sp.right != null ? 2 : 1);
  const scale = mmToScale(openW, page.heightMm, box.w * 0.92, box.h * 0.78, 24);
  const host = $("#spreadHost");
  host.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "spread-view";
  const pages = document.createElement("div");
  pages.className = "spread-pages";

  const addPage = (pageIdx) => {
    const d = document.createElement("div");
    d.className = "spread-page" + (pageIdx == null || !bookImage(pageIdx) ? " empty" : "");
    d.style.width = `${page.widthMm * scale}px`;
    d.style.height = `${page.heightMm * scale}px`;
    if (pageIdx != null && bookImage(pageIdx)) {
      d.style.backgroundImage = `url(${bookImage(pageIdx).src})`;
      d.innerHTML = `<span class="pg-num">${pageIdx + 1}</span>`;
    } else if (pageIdx == null) {
      d.textContent = "—";
    } else {
      d.textContent = `${pageIdx + 1}`;
      d.innerHTML += `<span class="pg-num">${pageIdx + 1}</span>`;
    }
    pages.appendChild(d);
  };

  if (sp.left != null) addPage(sp.left);
  if (sp.right != null) addPage(sp.right);
  else if (sp.left == null && sp.right != null) addPage(sp.right);

  const lab = document.createElement("div");
  lab.className = "finished-dims";
  lab.textContent = `스프레드 ${state.spreadIndex + 1}/${spreads.length} · ${sp.label} · 페이지 ${page.widthMm}×${page.heightMm} mm`;
  wrap.append(pages, lab);
  host.appendChild(wrap);
  $("#spreadOut").textContent = `${state.spreadIndex + 1} / ${spreads.length}`;
}

function renderBookletFlipbook() {
  const host = $("#flipbookHost");
  const page = getBookletPageSize();
  const box = stageBox();
  const openW = page.widthMm * 2;
  const scale = mmToScale(openW, page.heightMm, box.w * 0.9, box.h * 0.72, 20);
  const w = openW * scale;
  const h = page.heightMm * scale;

  if (!state.curlBook) {
    state.curlBook = createPageCurlBook(host, {
      getSpreads: getBookletSpreadsForCurl,
      onIndex: (i) => {
        state.spreadIndex = i;
        const spreads = buildSpreads(state.pageCount);
        $("#spreadOut").textContent = `${i + 1} / ${spreads.length}`;
      },
    });
  }
  state.curlBook.setSize(w, h);
  state.curlBook.setIndex(state.spreadIndex);
  state.curlBook.refresh();
  const credit = document.createElement("p");
  credit.className = "credit-note";
  credit.style.textAlign = "center";
  credit.innerHTML =
    '페이지 곡선 넘김 참고: <a href="https://github.com/MengTo/sketchbook" target="_blank" rel="noopener" style="color:#8eb4ff">MengTo/sketchbook</a>';
  // avoid stacking credits
  const old = host.querySelector(".credit-note");
  if (old) old.remove();
  host.appendChild(credit);
}

function renderBookletThumbs() {
  const host = $("#thumbsHost");
  host.innerHTML = "";
  for (let i = 0; i < state.pageCount; i++) {
    const card = document.createElement("div");
    card.className = "thumb-card";
    const img = document.createElement("div");
    img.className = "thumb-img";
    if (bookImage(i)) {
      img.style.backgroundImage = `url(${bookImage(i).src})`;
      img.textContent = "";
    } else {
      img.textContent = "빈 페이지";
    }
    const lab = document.createElement("div");
    lab.className = "thumb-label";
    lab.textContent = pageLabel(i, state.pageCount);
    card.append(img, lab);
    card.addEventListener("click", () => {
      // jump to spread containing this page
      const spreads = buildSpreads(state.pageCount);
      let si = 0;
      spreads.forEach((sp, j) => {
        if (sp.left === i || sp.right === i) si = j;
      });
      state.spreadIndex = si;
      state.viewMode = "flipbook";
      updateViewModeButtons();
      renderAll();
    });
    host.appendChild(card);
  }
}

function renderBooklet3d() {
  try { studio.renderBook(); }
  catch (err) { showBanner(`책 3D 표시 실패: ${err.message}`, true); }
}

main();
