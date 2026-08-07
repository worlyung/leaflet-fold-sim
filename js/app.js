import {
  computePanels,
  approxFinishedSize,
  mmToScale,
} from "./panel-math.js";
import { Leaflet3DViewer } from "./viewer-3d.js";
import {
  normalizePageCount,
  buildSpreads,
  estimateSheets,
  pageLabel,
} from "./booklet.js";
import { createPageCurlBook } from "./page-curl.js";

const state = {
  presets: null,
  productMode: "fold", // fold | booklet

  // fold
  sizeId: "a4",
  foldId: "half",
  orientation: "portrait",
  foldAxis: "vertical",
  deltaMm: 2,
  customW: 210,
  customH: 297,
  viewMode: "flat",
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
  bindingId: "saddle_stitch",
  pageCount: 12,
  /** @type {(HTMLImageElement|null)[]} */
  pageImages: [],
  spreadIndex: 0,
  curlBook: null,
  book3dViewer: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
  bindUI();
  populateSelects();
  rebuildPanelUploadSlots();
  rebuildBookletPageList();
  setProductMode(state.productMode, true);
  showBanner(
    "접지 리플렛 · 책자/브로슈어 지원. 책자 플립북 넘김은 MengTo/sketchbook 곡선 페이지 기법을 참고했습니다.",
    false
  );
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
  state.bindingId = b.bindingId || "saddle_stitch";
  state.bookletOrient = b.orientation || "portrait";
  ensurePageArray();
}

function ensurePageArray() {
  const n = state.pageCount;
  if (state.pageImages.length !== n) {
    const next = Array(n).fill(null);
    for (let i = 0; i < Math.min(n, state.pageImages.length); i++) {
      next[i] = state.pageImages[i];
    }
    state.pageImages = next;
  }
}

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
}

function refillPageCountSelect() {
  const sel = $("#pageCountSelect");
  const binding = state.presets.bindings?.find((b) => b.id === state.bindingId);
  const presets = state.presets.bookletPagePresets || [4, 8, 12, 16, 20, 24, 32];
  const min = binding?.minPages || 4;
  const max = binding?.maxPages || 48;
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

function setProductMode(mode, silent) {
  state.productMode = mode;
  $$("#modeToggle [data-mode]").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === mode)
  );
  $("#panelFold").hidden = mode !== "fold";
  $("#panelBooklet").hidden = mode !== "booklet";
  $("#toolbarFold").hidden = mode !== "fold";
  $("#toolbarBooklet").hidden = mode !== "booklet";
  $("#sideToggle").hidden = mode !== "fold";
  $("#foldAmountControl").hidden = mode === "booklet" && state.viewMode !== "book3d";
  $("#bookletNav").hidden = mode !== "booklet";

  if (mode === "fold") {
    if (["spread", "flipbook", "thumbs", "book3d"].includes(state.viewMode)) {
      state.viewMode = "flat";
    }
    $("#statsTitle").textContent = "패널 정보";
    if (!silent)
      showBanner("접지 리플렛 모드 — 전개/접힘/3D로 확인", false);
  } else {
    if (["flat", "folded", "flip", "open", "orbit3d"].includes(state.viewMode)) {
      state.viewMode = "flipbook";
    }
    $("#statsTitle").textContent = "책자 정보";
    if (!silent)
      showBanner(
        "책자 · 브로슈어 모드 — 스프레드/플립북(곡선 넘김)/전체 페이지",
        false
      );
  }
  updateViewModeButtons();
  renderAll();
}

function bindUI() {
  $$("#modeToggle [data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => setProductMode(btn.dataset.mode));
  });

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
        b.classList.toggle("active", b.dataset.side === state.showSide)
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
    $("#frontFileLabel").textContent = "앞면 이미지 선택";
    $("#backFileLabel").classList.remove("has-file");
    $("#backFileLabel").textContent = "뒷면 이미지 선택";
    rebuildPanelUploadSlots();
    renderAll();
  });

  // booklet
  $("#bookletSizeSelect").addEventListener("change", (e) => {
    state.bookletSizeId = e.target.value;
    updateBookletCustomVisibility();
    renderAll();
  });
  $("#bindingSelect").addEventListener("change", (e) => {
    state.bindingId = e.target.value;
    updateBindingNote();
    state.pageCount = normalizePageCount(state.pageCount, state.bindingId);
    refillPageCountSelect();
    ensurePageArray();
    rebuildBookletPageList();
    state.spreadIndex = 0;
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
    renderAll();
  });
  $("#bookletCustomW").addEventListener("input", (e) => {
    state.bookletCustomW = Number(e.target.value) || 148;
    renderAll();
  });
  $("#bookletCustomH").addEventListener("input", (e) => {
    state.bookletCustomH = Number(e.target.value) || 210;
    renderAll();
  });

  $("#bookletBulk").addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    files.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    const imgs = await Promise.all(files.map(loadImageFile));
    ensurePageArray();
    for (let i = 0; i < state.pageCount; i++) {
      state.pageImages[i] = imgs[i] || state.pageImages[i] || null;
    }
    $("#bookletBulkLabel").classList.add("has-file");
    $("#bookletBulkLabel").childNodes[0].textContent = `${Math.min(
      imgs.length,
      state.pageCount
    )}장 적용됨 · 다시 올리기`;
    rebuildBookletPageList();
    renderAll();
  });

  $("#clearBookletImages").addEventListener("click", () => {
    state.pageImages = Array(state.pageCount).fill(null);
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
    const img = await loadImageFile(file);
    if (which === "front") {
      state.frontImage = img;
      $("#frontFileLabel").classList.add("has-file");
      $("#frontFileLabel").textContent = file.name;
    } else {
      state.backImage = img;
      $("#backFileLabel").classList.add("has-file");
      $("#backFileLabel").textContent = file.name;
    }
    renderAll();
  });
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
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
      span.textContent = `${side === "front" ? "앞" : "뒤"} P${i + 1}`;
      const label = document.createElement("label");
      label.className = "file-btn";
      label.style.minHeight = "1.9rem";
      label.style.fontSize = "0.72rem";
      label.textContent = state.panelImages[key] ? "교체" : "없음";
      if (state.panelImages[key]) label.classList.add("has-file");
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", async () => {
        const f = input.files?.[0];
        if (!f) return;
        state.panelImages[key] = await loadImageFile(f);
        label.textContent = "적용됨";
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
    label.textContent = state.pageImages[i] ? "교체" : "없음";
    if (state.pageImages[i]) label.classList.add("has-file");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    const idx = i;
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      if (!f) return;
      state.pageImages[idx] = await loadImageFile(f);
      label.textContent = "적용됨";
      label.classList.add("has-file");
      renderAll();
    });
    label.appendChild(input);
    row.append(span, label);
    box.appendChild(row);
  }
}

function updateViewModeButtons() {
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
      btn.classList.toggle("active", state.viewMode === v);
    });
  } else {
    $$("#toolbarBooklet [data-view]").forEach((btn) => {
      btn.disabled = false;
      btn.classList.toggle("active", state.viewMode === btn.dataset.view);
    });
  }
}

function stageBox() {
  const wrap = $(".stage-wrap");
  return { w: wrap.clientWidth || 800, h: wrap.clientHeight || 500 };
}

function renderAll() {
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
  if (state.foldAxis === "vertical") {
    const sizePct = sheet.widthMm <= 0 ? 100 : (sheet.widthMm / p.width) * 100;
    return {
      has: true,
      style: {
        backgroundImage: `url(${img.src})`,
        backgroundSize: `${sizePct}% 100%`,
        backgroundPosition: `${(-p.x / p.width) * 100}% 0%`,
      },
    };
  }
  const sizePct = sheet.heightMm <= 0 ? 100 : (sheet.heightMm / p.height) * 100;
  return {
    has: true,
    style: {
      backgroundImage: `url(${img.src})`,
      backgroundSize: `100% ${sizePct}%`,
      backgroundPosition: `0% ${(-p.y / p.height) * 100}%`,
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
    if (state.foldAxis === "horizontal") sheetEl.style.flexDirection = "column";
    panels.forEach((p, i) => {
      const elp = document.createElement("div");
      elp.className = "panel";
      if (state.foldAxis === "vertical") {
        elp.style.width = `${p.width * scale}px`;
        elp.style.height = "100%";
      } else {
        elp.style.width = "100%";
        elp.style.height = `${p.height * scale}px`;
        elp.style.borderRight = "none";
        elp.style.borderBottom = "1px dashed rgba(240,180,41,0.85)";
      }
      const bg = panelBackground(side, i, panels, sheet);
      if (bg.has) {
        elp.classList.add("has-image");
        Object.assign(elp.style, bg.style);
      }
      elp.innerHTML = `<span class="idx">${side === "front" ? "F" : "B"}${i + 1}</span><div class="placeholder">패널 ${i + 1}<br>${(
        state.foldAxis === "vertical" ? p.width : p.height
      ).toFixed(1)} mm</div>`;
      sheetEl.appendChild(elp);
    });
    wrap.append(lab, sheetEl);
    return wrap;
  };
  host.appendChild(makeSheet("front", "앞면 전개도"));
  host.appendChild(makeSheet("back", "뒷면 전개도"));
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
  const coverKey = `${state.showSide}-0`;
  const img = state.showSide === "front" ? state.frontImage : state.backImage;
  if (state.panelImages[coverKey]) {
    card.style.backgroundImage = `url(${state.panelImages[coverKey].src})`;
    card.style.backgroundSize = "cover";
  } else if (img && state.foldAxis === "vertical") {
    const p = panels[0];
    card.style.backgroundImage = `url(${img.src})`;
    card.style.backgroundSize = `${(sheet.widthMm / p.width) * 100}% 100%`;
  } else {
    card.innerHTML = `<div class="placeholder">접힌 상태 표지<br>${finished.widthMm} × ${finished.heightMm} mm</div>`;
  }
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
  } else if (state.viewMode === "book3d" && state.book3dViewer) {
    state.book3dViewer.applyFold?.(state.foldAmount);
  }
}

/* ---------------- booklet mode ---------------- */

function getBookletSpreadsForCurl() {
  const spreads = buildSpreads(state.pageCount);
  return spreads.map((sp) => {
    const leftUrl =
      sp.left != null && state.pageImages[sp.left]
        ? state.pageImages[sp.left].src
        : null;
    const rightUrl =
      sp.right != null && state.pageImages[sp.right]
        ? state.pageImages[sp.right].src
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
  const filled = state.pageImages.filter(Boolean).length;
  const spreads = buildSpreads(state.pageCount);
  $("#stats").innerHTML = `
    <div><strong>페이지</strong> ${page.widthMm} × ${page.heightMm} mm · ${state.pageCount}p</div>
    <div><strong>제본</strong> ${binding?.label || state.bindingId}</div>
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
    book3d: "view-book3d",
  };
  $(`#${map[state.viewMode] || "view-flipbook"}`)?.classList.add("active");

  $("#bookletNav").hidden = !["spread", "flipbook"].includes(state.viewMode);
  $("#foldAmountControl").hidden = state.viewMode !== "book3d";

  if (state.viewMode === "spread") renderBookletSpread();
  else if (state.viewMode === "flipbook") renderBookletFlipbook();
  else if (state.viewMode === "thumbs") renderBookletThumbs();
  else if (state.viewMode === "book3d") renderBooklet3d();
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
    d.className = "spread-page" + (pageIdx == null || !state.pageImages[pageIdx] ? " empty" : "");
    d.style.width = `${page.widthMm * scale}px`;
    d.style.height = `${page.heightMm * scale}px`;
    if (pageIdx != null && state.pageImages[pageIdx]) {
      d.style.backgroundImage = `url(${state.pageImages[pageIdx].src})`;
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
    if (state.pageImages[i]) {
      img.style.backgroundImage = `url(${state.pageImages[i].src})`;
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
  // Reuse Leaflet3DViewer as a simple "open book" of current spread two panels
  const host = $("#book3dInner");
  const page = getBookletPageSize();
  const spreads = buildSpreads(state.pageCount);
  const sp = spreads[Math.min(state.spreadIndex, spreads.length - 1)];
  const panels = [];
  if (sp.left != null) {
    panels.push({ index: 0, width: page.widthMm, height: page.heightMm, x: 0, y: 0 });
  }
  if (sp.right != null) {
    panels.push({
      index: panels.length,
      width: page.widthMm,
      height: page.heightMm,
      x: page.widthMm,
      y: 0,
    });
  }
  if (!panels.length) {
    panels.push({ index: 0, width: page.widthMm, height: page.heightMm, x: 0, y: 0 });
  }

  // map page images into panelImages keys
  const panelImages = {};
  let pi = 0;
  if (sp.left != null && state.pageImages[sp.left]) {
    panelImages[`front-${pi}`] = state.pageImages[sp.left];
    pi++;
  }
  if (sp.right != null && state.pageImages[sp.right]) {
    panelImages[`front-${pi}`] = state.pageImages[sp.right];
  }

  if (!state.book3dViewer) {
    try {
      state.book3dViewer = new Leaflet3DViewer(host);
    } catch (e) {
      host.innerHTML = `<p style="color:#f07178;padding:1rem">3D 로드 실패: ${e.message}</p>`;
      return;
    }
  }
  state.book3dViewer.resize();
  state.book3dViewer.build({
    panels,
    foldId: "half",
    foldAxis: "vertical",
    frontImage: null,
    backImage: null,
    panelImages,
  });
  state.book3dViewer.applyFold(state.foldAmount);
}

main();
