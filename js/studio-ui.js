import { Poster3DViewer } from "./poster-3d.js";
import { Photozone3DViewer, photozoneDimensions } from "./photozone-3d.js";
import { Book3DViewer, bookDimensions } from "./book-3d.js";

const $ = (s) => document.querySelector(s);
const numeric = (id, text, value, min, max, step = 1) => `<div class="field"><label for="${id}">${text}</label><input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></div>`;
const upload = (id, text) => `<div class="field"><label for="${id}">${text}</label><div class="asset-input"><input id="${id}" type="file" accept="image/*"><button type="button" data-clear="${id}" aria-label="${text} 지우기">×</button></div><small id="${id}Status" class="hint">이미지 없음</small></div>`;
const check = (id, text) => `<label class="studio-check"><input id="${id}" type="checkbox" checked> ${text}</label>`;
export function initStudioUI({ state, renderAll, loadImageFile, showBanner, getBookletPageSize, rebuildBookletPageList }) {
  state.poster = { width: 420, height: 594, front: null, back: null, backColor: "#ede9df" };
  state.photozone = { width: 4000, height: 2500, depth: 1200, section: 290, printWidth: 4000, printHeight: 2500,
    mount: "cover", front: null, back: null, backColor: "#e6e3da", showPrint: true, braces: true, feet: true, weights: true, person: true, personHeight: 1700 };
  state.book = { paperThickness: 0.12, coverThickness: 0.25, open: 115, turn: 0.4, front: null, back: null, spine: null };
  state.objectRotations = {};
  const sidebar = $(".sidebar");
  sidebar.insertAdjacentHTML("beforeend", `<div id="panelPoster" hidden>
    <section class="section"><h2>포스터 규격</h2><div class="row">${numeric("posterWidth", "가로 mm", 420, 50, 5000)}${numeric("posterHeight", "세로 mm", 594, 50, 5000)}</div></section>
    <section class="section"><h2>양면 디자인</h2>${upload("posterFront", "포스터 앞면")}${upload("posterBack", "포스터 뒷면")}
    <div class="field"><label for="posterColor">뒷면 종이색</label><input id="posterColor" type="color" value="#ede9df"></div><p class="hint">뒷면 이미지가 없으면 종이색으로 보여요.</p></section></div>
    <div id="panelPhotozone" hidden><section class="section"><h2>트러스 외곽 규격</h2>
    <div class="row">${numeric("zoneWidth", "가로 mm", 4000, 1000, 12000)}${numeric("zoneHeight", "높이 mm", 2500, 1000, 6000)}</div>
    <div class="row">${numeric("zoneDepth", "뒤쪽 받침 길이 mm", 1200, 400, 4000)}${numeric("zoneSection", "트러스 단면 mm", 290, 100, 600)}</div>
    <p class="hint">수정 가능한 예시 규격이에요. 설치 외형 확인용이며 구조 안전성 계산은 포함하지 않아요.</p></section>
    <section class="section"><h2>출력물</h2><div class="row">${numeric("zonePrintW", "출력 가로 mm", 4000, 100, 12000)}${numeric("zonePrintH", "출력 높이 mm", 2500, 100, 6000)}</div>
    <div class="field"><label for="zoneMount">출력물 설치 위치</label><select id="zoneMount"><option value="cover">트러스 앞에 덮기</option><option value="inset">트러스 안쪽에 설치</option></select></div>
    ${upload("zoneFront", "포토존 앞면")}${upload("zoneBack", "포토존 뒷면")}
    <div class="field"><label for="zoneColor">단면 출력의 배면색</label><input id="zoneColor" type="color" value="#e6e3da"></div>
    ${check("zonePrint", "출력물 표시")}</section>
    <section class="section"><h2>구조 · 크기 비교</h2>${check("zoneBraces", "후면 지지대")}${check("zoneFeet", "바닥 받침")}${check("zoneWeights", "웨이트")}${check("zonePerson", "사람 모형")}
    ${numeric("zonePersonHeight", "사람 키 mm", 1700, 500, 2200)}</section></div>`);
  $("#panelBooklet").insertAdjacentHTML("afterbegin", `<section class="section"><h2>책 3D · 표지</h2>
    <div class="row">${numeric("bookPaperThickness", "내지 한 장 두께 mm", state.book.paperThickness, 0.05, 0.5, 0.01)}${numeric("bookCoverThickness", "표지 한 장 두께 mm", state.book.coverThickness, 0.1, 8, 0.05)}</div>
    <p class="hint">리플렛의 책자형은 얇은 종이를 가운데 묶는 중철이에요. 책에서는 각양장·환양장 등 제본 방식을 선택할 수 있어요.</p>
    <p class="hint">책 전체 두께: <output id="bookThickness"></output> mm · 내지 장수와 표지 두께로 자동 계산해요.</p>
    ${upload("bookFront", "앞표지")}${upload("bookBack", "뒷표지")}${upload("bookSpine", "책등")}
    <p class="hint">별도 표지가 페이지 목록의 첫·마지막 이미지보다 우선해요. 책등 이미지는 무선·양장에서 사용해요. 중철 표지는 최대 0.5mm로 표현해요.</p></section>`);
  $("#bookletBulkLabel").closest(".section").insertAdjacentHTML("afterbegin", `<div class="field"><label for="bookImportMode">PDF · 묶음 이미지 구성</label><select id="bookImportMode"><option value="covers">첫 장은 앞표지, 마지막은 뒷표지</option><option value="interior">내지만 (표지는 별도 입력)</option></select><p class="hint">페이지 수는 표지 포함 전체 면수예요. 내지만 불러오면 표지 두 면을 추가해요. 책은 최대 512면, 중철은 최대 64면이에요.</p></div>`);
  $(".stage-wrap").insertAdjacentHTML("beforeend", `<div class="stage" id="view-studio"><div class="stage-3d-inner" id="studioInner"><div class="orbit-hint">드래그: 360° 회전 · 휠: 확대 · 오른쪽 드래그: 이동</div></div></div>`);
  $(".toolbar").insertAdjacentHTML("beforeend", `<div id="studioCamera" class="studio-camera" hidden>
    <span class="group-label">시점</span>${[["front", "정면"], ["back", "뒤"], ["left", "좌"], ["right", "우"], ["top", "위"], ["iso", "전체 보기"]].map(([d,l]) => `<button type="button" data-camera="${d}">${l}</button>`).join("")}
    <button type="button" id="autoOrbit" aria-pressed="false">자동 회전</button>
    <details class="object-rotation"><summary>물체 뒤집기</summary><div class="rotation-fields">${["X", "Y", "Z"].map((axis) => numeric(`rotate${axis}`, `${axis}축 °`, 0, -360, 360)).join("")}<button type="button" id="resetRotation">초기화</button></div></details></div>`);
  $(".bottombar").insertAdjacentHTML("beforeend", `<div id="book3dControls" class="studio-book-controls" hidden>
    <div class="control"><label for="bookOpen">표지 펼침</label><input id="bookOpen" type="range" min="0" max="180" step="1" value="115"><output id="bookOpenOut">115°</output></div>
    <div class="control"><button type="button" id="bookLeafPrev" aria-label="이전 내지">←</button><label for="bookTurn">내지 넘김</label><input id="bookTurn" type="range" min="0" max="1" step="0.001" value="0.4"><button type="button" id="bookLeafNext" aria-label="다음 내지">→</button><output id="bookTurnOut"></output></div>
    <span class="hint">종이 움직임은 시각적 근사예요.</span></div>`);

  const bind = (id, obj, key) => {
    const el = $(`#${id}`);
    el.addEventListener("change", () => {
      let value = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "number") {
        value = Number(value);
        if (!el.value || !Number.isFinite(value)) { el.value = obj[key]; return; }
        value = Math.max(Number(el.min), Math.min(Number(el.max), value)); el.value = value;
      }
      obj[key] = value;
      if (obj === state.photozone) {
        if (key === "mount" && value === "inset") {
          obj.printWidth = obj.width - obj.section * 2 - 40; obj.printHeight = obj.height - obj.section * 2 - 40;
        }
        const actual = photozoneDimensions(obj);
        obj.printWidth = actual.printWidth; obj.printHeight = actual.printHeight; obj.section = actual.section;
        $("#zoneSection").value = obj.section;
        $("#zonePrintW").value = obj.printWidth; $("#zonePrintH").value = obj.printHeight;
      }
      renderAll();
    });
  };
  for (const [id,key] of [["posterWidth","width"],["posterHeight","height"],["posterColor","backColor"]]) bind(id,state.poster,key);
  for (const [id,key] of [["zoneWidth","width"],["zoneHeight","height"],["zoneDepth","depth"],["zoneSection","section"],["zonePrintW","printWidth"],["zonePrintH","printHeight"],["zoneMount","mount"],["zoneColor","backColor"],["zonePrint","showPrint"],["zoneBraces","braces"],["zoneFeet","feet"],["zoneWeights","weights"],["zonePerson","person"],["zonePersonHeight","personHeight"]]) bind(id,state.photozone,key);
  bind("bookPaperThickness",state.book,"paperThickness"); bind("bookCoverThickness",state.book,"coverThickness");
  for (const [id, obj, key] of [["posterFront",state.poster,"front"],["posterBack",state.poster,"back"],["zoneFront",state.photozone,"front"],["zoneBack",state.photozone,"back"],["bookFront",state.book,"front"],["bookBack",state.book,"back"],["bookSpine",state.book,"spine"]]) {
    $(`#${id}`).addEventListener("change", async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        obj[key] = await loadImageFile(file); $(`#${id}Status`).textContent = file.name;
        if (obj === state.book) rebuildBookletPageList();
        renderAll();
      } catch { showBanner("이미지를 읽지 못했어요. PNG 또는 JPG 파일로 다시 선택해 주세요.", true); }
    });
    $(`[data-clear="${id}"]`).addEventListener("click", () => {
      obj[key] = null; $(`#${id}`).value = ""; $(`#${id}Status`).textContent = "이미지 없음"; renderAll();
    });
  }
  let extraViewer = null, extraType = null, leafAnimation = 0;
  const active = () => state.productMode === "fold" ? state.viewer3d : state.productMode === "booklet" ? state.book3dViewer : extraViewer;
  const updateBookMotion = () => {
    state.book3dViewer?.setOpen(state.book.open, state.book.turn);
    $("#bookOpen").value = state.book.open; $("#bookOpenOut").textContent = `${state.book.open}°`;
    $("#bookTurn").value = state.book.turn;
    const leaves = Math.max(0, state.pageCount / 2 - (state.brochure ? 2 : 1));
    $("#bookTurnOut").textContent = `${Math.round(state.book.turn * leaves * 10) / 10} / ${leaves}장`;
  };
  $("#bookOpen").addEventListener("input", (e) => { state.book.open = Number(e.target.value); updateBookMotion(); });
  $("#bookTurn").addEventListener("input", (e) => { cancelAnimationFrame(leafAnimation); state.book.turn = Number(e.target.value); updateBookMotion(); });
  for (const [id, sign] of [["bookLeafPrev", -1], ["bookLeafNext", 1]]) $("#"+id).addEventListener("click", () => {
    cancelAnimationFrame(leafAnimation);
      const start = state.book.turn, n = Math.max(1, state.pageCount / 2 - (state.brochure ? 2 : 1));
    const end = Math.max(0, Math.min(1, (sign > 0 ? Math.floor(start * n + 0.001) + 1 : Math.ceil(start * n - 0.001) - 1) / n));
    const began = performance.now();
    const frame = (now) => { const t = Math.min(1, (now - began) / 550); state.book.turn = start + (end - start) * (t * t * (3 - 2 * t)); updateBookMotion(); if (t < 1) leafAnimation = requestAnimationFrame(frame); };
    leafAnimation = requestAnimationFrame(frame);
  });
  document.querySelectorAll("[data-camera]").forEach((el) => el.addEventListener("click", () => active()?.frameCamera(el.dataset.camera)));
  $("#autoOrbit").addEventListener("click", () => { const v=active(); if(v) { v.autoRotate=!v.autoRotate; $("#autoOrbit").setAttribute("aria-pressed",String(v.autoRotate)); } });
  const rotation = () => {
    const r = ["X","Y","Z"].map((axis) => Math.max(-360, Math.min(360, Number($("#rotate"+axis).value) || 0)));
    state.objectRotations[state.productMode] = r; active()?.setRotation(...r);
  };
  for (const axis of ["X","Y","Z"]) $("#rotate"+axis).addEventListener("input",rotation);
  $("#resetRotation").addEventListener("click", () => { for(const axis of ["X","Y","Z"]) $("#rotate"+axis).value=0; rotation(); active()?.frameCamera(); });

  return {
    active,
    sync() {
      const is3d = ["orbit3d","book3d","studio"].includes(state.viewMode);
      $("#panelPoster").hidden = state.productMode !== "poster";
      $("#panelPhotozone").hidden = state.productMode !== "photozone";
      $("#studioCamera").hidden = !is3d;
      $("#book3dControls").hidden = state.viewMode !== "book3d";
      $("#foldAmountControl").hidden = state.productMode !== "fold";
      $("#autoOrbit").setAttribute("aria-pressed", String(active()?.autoRotate || false));
      const r = state.objectRotations[state.productMode] || [0,0,0];
      ["X","Y","Z"].forEach((a,i) => { $("#rotate"+a).value=r[i]; });
    },
    renderExtra() {
      document.querySelectorAll(".stage").forEach((s) => s.classList.remove("active"));
      $("#view-studio").classList.add("active");
      if (extraType !== state.productMode) { extraViewer?.dispose(); extraViewer=null; extraType=state.productMode; }
      if (!extraViewer) extraViewer = new (extraType === "poster" ? Poster3DViewer : Photozone3DViewer)($("#studioInner"));
      const o = state[extraType]; extraViewer.resize();
      extraViewer.setRotation(...(state.objectRotations[extraType] || [0,0,0]));
      extraViewer.build(o);
      this.sync();
      $("#statsTitle").textContent=extraType === "poster" ? "포스터" : "트러스 포토존";
      $("#stats").textContent= `${o.width} × ${o.height} mm${extraType === "photozone" ? ` · 뒤쪽 받침 ${o.depth} mm` : " · 양면"}`;
      $("#widthChips").textContent=extraType === "photozone" ? `출력물 ${o.printWidth} × ${o.printHeight} mm` : "실제 비율 · 360° 확인";
    },
    renderBook() {
      const s = getBookletPageSize(), o = state.book;
      const actual = bookDimensions({ ...o, binding: state.bindingId, pages: state.pageImages.slice(1,-1) });
      $("#bookThickness").value = actual.thickness.toFixed(2);
      const ring = ["spiral","wire"].includes(state.bindingId);
      $("#bookOpen").max = ring ? 360 : 180; o.open = Math.min(o.open, ring ? 360 : 180);
      if (!state.book3dViewer) state.book3dViewer = new Book3DViewer($("#book3dInner"));
      state.book3dViewer.resize();
      state.book3dViewer.build({ ...o, brochure: state.brochure, width:s.widthMm, height:s.heightMm, binding:state.bindingId,
        front:o.front || state.pageImages[0], back:o.back || state.pageImages[state.pageCount-1], pages:state.pageImages.slice(1,-1) });
      $("#bookThickness").value = state.book3dViewer.dimensions.thickness.toFixed(2);
      $("#bookSpine").closest(".field").hidden = state.brochure;
      $("#bookTurn").disabled = state.brochure && state.pageCount === 4;
      $("#bookLeafPrev").disabled = $("#bookLeafNext").disabled = state.brochure && state.pageCount === 4;
      $("#statsTitle").textContent = state.brochure ? "책자형 리플렛" : "책 정보";
      updateBookMotion();
    },
    async demo(load) {
      const o=state[state.productMode]; o.front=await load("./fixtures/fold-front"); o.back=await load("./fixtures/fold-back");
      const prefix=state.productMode === "poster" ? "poster" : "zone";
      $("#"+prefix+"FrontStatus").textContent="데모 앞면"; $("#"+prefix+"BackStatus").textContent="데모 뒷면";
      renderAll();
    }
  };
}
