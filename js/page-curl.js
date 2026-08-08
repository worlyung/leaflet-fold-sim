/**
 * Curved page-turn (nested strip chain).
 * Adapted from Meng To — sketchbook
 * https://github.com/MengTo/sketchbook
 * (paper bends along width instead of pivoting like a flat door)
 *
 * API uses spread images (full open book) OR left/right page pair URLs.
 */

const STRIP_N = 16;
const SPAN = 0.48; // half-page width fraction of full book
const BETA = 0.55; // peak curl radians

function el(t, c) {
  const e = document.createElement(t);
  if (c) e.className = c;
  return e;
}

/**
 * @typedef {{ leftUrl?: string|null, rightUrl?: string|null, fullUrl?: string|null, label?: string }} SpreadFace
 */

/**
 * Mount a flipbook into container.
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {() => SpreadFace[]} opts.getSpreads
 * @param {(i:number)=>void} [opts.onIndex]
 */
export function createPageCurlBook(container, opts) {
  const root = el("div", "curl-root");
  const stage = el("div", "curl-stage");
  const book3d = el("div", "curl-3d");
  const book = el("div", "curl-book");
  const hint = el("p", "curl-hint");
  hint.textContent = "페이지를 드래그해 넘기세요 · 탭/←→ 키도 가능";
  book3d.appendChild(book);
  stage.append(book3d, hint);
  root.appendChild(stage);
  container.innerHTML = "";
  container.appendChild(root);

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let idx = 0;
  let turn = null; // { dir, from, to, t }
  let strips = [];
  let spring = null;
  let raf = null;
  let last = 0;
  let drag = null;
  let bookW = 400;
  let bookH = 280;

  function spreads() {
    return opts.getSpreads() || [];
  }

  function M() {
    return Math.max(1, spreads().length);
  }

  function setSize(w, h) {
    bookW = w;
    bookH = h;
    book.style.width = `${w}px`;
    book.style.height = `${h}px`;
    book3d.style.setProperty("--bw", `${w}px`);
    book3d.style.setProperty("--bh", `${h}px`);
  }

  function halfEl(pos, url, label) {
    const d = el("div", `curl-half ${pos}`);
    if (url) {
      d.style.backgroundImage = `url(${url})`;
    } else {
      d.classList.add("empty");
      d.innerHTML = `<span>${label || ""}</span>`;
    }
    d.appendChild(el("div", `curl-gutter ${pos}`));
    return d;
  }

  function fullEl(face) {
    const d = el("div", "curl-full");
    if (face.fullUrl) {
      d.style.backgroundImage = `url(${face.fullUrl})`;
    } else {
      // compose two halves
      const row = el("div", "curl-full-row");
      row.appendChild(halfEl("left", face.leftUrl, "좌"));
      row.appendChild(halfEl("right", face.rightUrl, "우"));
      d.appendChild(row);
      return d;
    }
    return d;
  }

  function bgFor(face, side) {
    if (face.fullUrl) return face.fullUrl;
    return side === "left" ? face.leftUrl : face.rightUrl;
  }

  /**
   * Nested strip chain — geometry from sketchbook buildCurl.
   * from/to are spread indices; we use right half of from and left half of to for "next".
   */
  function buildCurl(dir, fromFace, toFace) {
    strips = [];
    const c = el("div", `curl-leaf ${dir}`);
    c.style.setProperty("--n", String(STRIP_N));
    c.style.setProperty("--span", String(SPAN));
    let host = c;

    // For composed pages, curl uses right page of current / left of next as turn surfaces
    const fromUrl =
      dir === "next"
        ? fromFace.rightUrl || fromFace.fullUrl
        : fromFace.leftUrl || fromFace.fullUrl;
    const toUrl =
      dir === "next"
        ? toFace.leftUrl || toFace.fullUrl
        : toFace.rightUrl || toFace.fullUrl;

    for (let i = 0; i < STRIP_N; i++) {
      const s = el("div", "curl-strip");
      const gut = "calc(var(--bw) * 0.5)";
      const sw = `calc(var(--bw) * ${SPAN} / ${STRIP_N})`;
      const A = `calc(-1 * (${gut} + ${i} * ${sw}))`;
      const B = `calc(${i + 1} * ${sw} - ${gut})`;

      const f = el("div", "curl-face front");
      const b = el("div", "curl-face back");
      const dress = (node, url, px) => {
        if (url) {
          node.style.backgroundImage = `url(${url})`;
          node.style.backgroundPositionX = px;
          node.style.backgroundSize = "var(--bw) auto";
          node.style.backgroundRepeat = "no-repeat";
        } else {
          node.classList.add("empty-face");
        }
      };
      dress(f, fromUrl || null, dir === "next" ? A : B);
      dress(b, toUrl || null, dir === "next" ? B : A);
      f.appendChild(el("div", "curl-sh"));
      f.appendChild(el("div", "curl-gl"));
      b.appendChild(el("div", "curl-sh"));
      b.appendChild(el("div", "curl-gl"));
      s.appendChild(f);
      s.appendChild(b);
      if (i === STRIP_N - 1) s.classList.add("edge");
      host.appendChild(s);
      host = s;
      strips.push(s);
    }
    return c;
  }

  function applyTurn(t) {
    const th = Math.PI * t;
    const beta = BETA * Math.sin(Math.PI * t);
    const D = 180 / Math.PI;
    const tt = th + beta;
    const td = (2 * beta) / STRIP_N;
    book3d.style.setProperty("--tt", `${(tt * D).toFixed(2)}deg`);
    book3d.style.setProperty("--td", `${(td * D).toFixed(3)}deg`);
    book3d.style.setProperty("--shade", Math.sin(Math.PI * t).toFixed(3));
    for (let i = 0; i < strips.length; i++) {
      const l1 = Math.abs(Math.cos(tt - i * td));
      const l2 = Math.abs(Math.cos(tt - (i + 1) * td));
      const st = strips[i].style;
      st.setProperty("--a1", ((1 - l1) * 0.55).toFixed(3));
      st.setProperty("--a2", ((1 - l2) * 0.55).toFixed(3));
    }
  }

  function paint() {
    const list = spreads();
    if (!list.length) {
      book.innerHTML = `<div class="curl-empty">페이지 이미지를 올려 주세요</div>`;
      return;
    }
    idx = ((idx % list.length) + list.length) % list.length;
    book.textContent = "";
    if (!turn) {
      book.appendChild(fullEl(list[idx]));
      book3d.style.setProperty("--shade", "0");
    } else {
      const from = list[turn.from];
      const to = list[turn.to];
      const next = turn.dir === "next";
      book.appendChild(
        halfEl(
          "left",
          next ? from.leftUrl : to.leftUrl,
          next ? from.label : to.label
        )
      );
      book.appendChild(
        halfEl(
          "right",
          next ? to.rightUrl : from.rightUrl,
          next ? to.label : from.label
        )
      );
      // If fullUrl spreads, halves need different handling
      if (from.fullUrl || to.fullUrl) {
        book.textContent = "";
        book.appendChild(halfEl("left", null));
        const leftH = book.querySelector(".curl-half.left");
        const rightH = halfEl("right", null);
        // show full spread as background on halves with clip
        if (from.fullUrl) {
          leftH.style.backgroundImage = `url(${from.fullUrl})`;
          leftH.style.backgroundSize = "200% 100%";
          leftH.style.backgroundPosition = "0% 0%";
          leftH.classList.remove("empty");
        }
        if (to.fullUrl) {
          rightH.style.backgroundImage = `url(${to.fullUrl})`;
          rightH.style.backgroundSize = "200% 100%";
          rightH.style.backgroundPosition = "100% 0%";
          rightH.classList.remove("empty");
        }
        book.append(leftH, rightH, buildCurl(turn.dir, from, to));
      } else {
        book.appendChild(buildCurl(turn.dir, from, to));
      }
      applyTurn(turn.t);
    }
    const a = el("button", "curl-zone curl-prev");
    const b = el("button", "curl-zone curl-next");
    a.type = "button";
    b.type = "button";
    a.setAttribute("aria-label", "이전");
    b.setAttribute("aria-label", "다음");
    a.onclick = (e) => {
      e.stopPropagation();
      step("prev");
    };
    b.onclick = (e) => {
      e.stopPropagation();
      step("next");
    };
    book.append(a, b);
    opts.onIndex?.(idx);
  }

  function animateTo(target, onDone, stiff, damp) {
    spring = {
      kind: "spring",
      v: 0,
      target,
      done: onDone,
      k: stiff || 160,
      c: damp || 24,
    };
    kick();
  }

  function tick(now) {
    raf = null;
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    if (spring && turn) {
      const s = spring;
      const x = turn.t - s.target;
      s.v += (-s.k * x - s.c * s.v) * dt;
      turn.t += s.v * dt;
      if (Math.abs(turn.t - s.target) < 0.002 && Math.abs(s.v) < 0.02) {
        turn.t = s.target;
        spring = null;
        applyTurn(turn.t);
        const d = s.done;
        d && d();
      } else applyTurn(turn.t);
    }
    if (spring && raf === null) raf = requestAnimationFrame(tick);
  }

  function kick() {
    if (raf === null) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function startTurn(dir, t) {
    spring = null;
    if (turn) {
      idx = turn.to;
      turn = null;
    }
    const from = idx;
    const m = M();
    turn = {
      dir,
      from,
      to: dir === "next" ? (from + 1) % m : (from - 1 + m) % m,
      t: t || 0,
    };
    paint();
  }

  function commit() {
    if (!turn) return;
    if (reduced) {
      idx = turn.to;
      turn = null;
      paint();
      return;
    }
    animateTo(
      1,
      () => {
        idx = turn.to;
        turn = null;
        paint();
      },
      170,
      26
    );
  }

  function cancel() {
    if (!turn) return;
    animateTo(
      0,
      () => {
        turn = null;
        paint();
      },
      150,
      24
    );
  }

  function step(dir) {
    if (turn) {
      idx = turn.to;
      turn = null;
    }
    startTurn(dir, 0);
    commit();
    hideHint();
  }

  function goTo(i) {
    const m = M();
    if (!m) return;
    i = ((i % m) + m) % m;
    if (i === idx && !turn) return;
    if (turn) {
      idx = turn.to;
      turn = null;
    }
    idx = i;
    paint();
  }

  function hideHint() {
    hint.classList.add("gone");
  }

  // Pointer drag (sketchbook endDrag logic)
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("button.curl-zone")) return;
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    hideHint();
    const r = book.getBoundingClientRect();
    if (!r.width) return;
    const dir = (e.clientX - r.left) / r.width > 0.5 ? "next" : "prev";
    startTurn(dir, 0);
    drag = {
      dir,
      x0: e.clientX,
      w: r.width,
      moved: 0,
      vel: 0,
      tPrev: performance.now(),
    };
  });

  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    const raw = (drag.dir === "next" ? -dx : dx) / (drag.w * 0.62);
    const t = Math.max(0, Math.min(1, raw));
    const now = performance.now();
    drag.vel = (t - (turn ? turn.t : 0)) / Math.max(0.001, (now - drag.tPrev) / 1000);
    drag.tPrev = now;
    if (turn) {
      turn.t = t;
      applyTurn(t);
    }
  });

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!turn) return;
    if (d.moved < 6) {
      commit();
      return;
    }
    const go = turn.t > 0.42 || d.vel > 1.1;
    if (go) commit();
    else cancel();
  }

  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("dragstart", (e) => e.preventDefault());

  function onKey(e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // 플립북이 화면에 없으면(다른 뷰) 방향키를 가로채지 않는다
    if (!container.offsetParent) return;
    const t = e.target;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "SELECT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable)
    )
      return;
    e.preventDefault();
    step(e.key === "ArrowRight" ? "next" : "prev");
  }
  addEventListener("keydown", onKey);

  return {
    setSize,
    paint,
    refresh: paint,
    step,
    goTo,
    getIndex: () => idx,
    setIndex: (i) => {
      idx = i;
      paint();
    },
    destroy() {
      removeEventListener("keydown", onKey);
      if (raf) cancelAnimationFrame(raf);
      container.innerHTML = "";
    },
  };
}
