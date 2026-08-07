/**
 * Export flat layouts and imposition sheets to PNG / multi-page PDF.
 * PDF uses pdf-lib from global PDFLib (CDN).
 */

const PX_PER_MM = 4; // ~150dpi-ish for preview export
const PAD = 24;

/**
 * Draw a labeled panel strip (fold flat front or back).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 */
export function drawFoldSheet(ctx, opts) {
  const {
    x0 = PAD,
    y0 = PAD,
    panels,
    sheet,
    foldAxis,
    images, // { getPanel(side,i) => HTMLImageElement|null, front, back }
    side,
    scale = PX_PER_MM,
    title,
  } = opts;

  const W = sheet.widthMm * scale;
  const H = sheet.heightMm * scale;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x0, y0, W, H);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, W, H);

  panels.forEach((p, i) => {
    const px = x0 + (foldAxis === "vertical" ? p.x * scale : 0);
    const py = y0 + (foldAxis === "horizontal" ? p.y * scale : 0);
    const pw = (foldAxis === "vertical" ? p.width : sheet.widthMm) * scale;
    const ph = (foldAxis === "horizontal" ? p.height : sheet.heightMm) * scale;

    const img =
      images.getPanel?.(side, i) ||
      (side === "front" ? images.front : images.back);

    if (img) {
      try {
        if (images.getPanel?.(side, i)) {
          ctx.drawImage(img, px, py, pw, ph);
        } else if (foldAxis === "vertical") {
          // slice from full front/back
          const sx = (p.x / sheet.widthMm) * img.naturalWidth;
          const sw = (p.width / sheet.widthMm) * img.naturalWidth;
          ctx.drawImage(img, sx, 0, sw, img.naturalHeight, px, py, pw, ph);
        } else {
          const sy = (p.y / sheet.heightMm) * img.naturalHeight;
          const sh = (p.height / sheet.heightMm) * img.naturalHeight;
          ctx.drawImage(img, 0, sy, img.naturalWidth, sh, px, py, pw, ph);
        }
      } catch {
        fillPlaceholder(ctx, px, py, pw, ph, `${side[0].toUpperCase()}${i + 1}`);
      }
    } else {
      fillPlaceholder(ctx, px, py, pw, ph, `${side[0].toUpperCase()}${i + 1}`);
    }

    // crease
    ctx.strokeStyle = "rgba(200,160,40,0.7)";
    ctx.setLineDash([4, 3]);
    if (foldAxis === "vertical" && i < panels.length - 1) {
      ctx.beginPath();
      ctx.moveTo(px + pw, py);
      ctx.lineTo(px + pw, py + ph);
      ctx.stroke();
    }
    if (foldAxis === "horizontal" && i < panels.length - 1) {
      ctx.beginPath();
      ctx.moveTo(px, py + ph);
      ctx.lineTo(px + pw, py + ph);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${side === "front" ? "F" : "B"}${i + 1}`, px + 4, py + 14);
  });

  if (title) {
    ctx.fillStyle = "#222";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(title, x0, y0 - 8);
  }
  ctx.restore();
  return { width: W, height: H };
}

function fillPlaceholder(ctx, x, y, w, h, label) {
  ctx.fillStyle = "#eef1f6";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#ccc";
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#6a7385";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/**
 * Full fold export canvas (front + back stacked).
 */
export function renderFoldFlatCanvas({
  sheet,
  panels,
  foldAxis,
  frontImage,
  backImage,
  panelImages,
  foldLabel,
  sizeLabel,
}) {
  const scale = PX_PER_MM;
  const W = sheet.widthMm * scale + PAD * 2;
  const gap = 40;
  const H = sheet.heightMm * scale * 2 + PAD * 2 + gap + 28;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(W);
  canvas.height = Math.ceil(H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0f2f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#111";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(
    `전개도 · ${sizeLabel || ""} · ${foldLabel || ""} · ${sheet.widthMm}×${sheet.heightMm} mm`,
    PAD,
    18
  );

  const images = {
    front: frontImage,
    back: backImage,
    getPanel(side, i) {
      return panelImages?.[`${side}-${i}`] || null;
    },
  };

  drawFoldSheet(ctx, {
    x0: PAD,
    y0: PAD + 20,
    panels,
    sheet,
    foldAxis,
    images,
    side: "front",
    scale,
    title: "앞면 (Front)",
  });
  drawFoldSheet(ctx, {
    x0: PAD,
    y0: PAD + 20 + sheet.heightMm * scale + gap,
    panels,
    sheet,
    foldAxis,
    images,
    side: "back",
    scale,
    title: "뒷면 (Back)",
  });

  return canvas;
}

/**
 * One imposition sheet face (left|right page images).
 */
export function drawImpositionFace(ctx, x0, y0, pageW, pageH, leftImg, rightImg, leftLabel, rightLabel, scale) {
  const pw = pageW * scale;
  const ph = pageH * scale;
  ctx.fillStyle = "#fff";
  ctx.fillRect(x0, y0, pw * 2, ph);
  ctx.strokeStyle = "#333";
  ctx.strokeRect(x0, y0, pw * 2, ph);

  const drawHalf = (img, x, label) => {
    if (img) {
      try {
        ctx.drawImage(img, x, y0, pw, ph);
      } catch {
        fillPlaceholder(ctx, x, y0, pw, ph, label);
      }
    } else {
      fillPlaceholder(ctx, x, y0, pw, ph, label);
    }
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "11px sans-serif";
    ctx.fillText(label, x + 4, y0 + 14);
  };

  drawHalf(leftImg, x0, leftLabel);
  drawHalf(rightImg, x0 + pw, rightLabel);

  // center fold
  ctx.strokeStyle = "rgba(200,160,40,0.85)";
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x0 + pw, y0);
  ctx.lineTo(x0 + pw, y0 + ph);
  ctx.stroke();
  ctx.setLineDash([]);

  return { width: pw * 2, height: ph };
}

/**
 * All saddle sheets → one tall canvas or multi-page later.
 */
export function renderImpositionCanvas({
  pageSize,
  imposition,
  pageImages,
  pageCount,
  title,
}) {
  const scale = PX_PER_MM;
  const pageW = pageSize.widthMm;
  const pageH = pageSize.heightMm;
  const sheetW = pageW * 2 * scale;
  const sheetH = pageH * scale;
  const gap = 36;
  const header = 36;
  const faceGap = 16;
  const blockH = sheetH * 2 + faceGap + 28;
  const H = PAD * 2 + header + imposition.length * (blockH + gap);
  const W = PAD * 2 + sheetW;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(W);
  canvas.height = Math.ceil(H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0f2f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(
    title || `중철 임포지션 · ${pageCount}p · 시트 ${imposition.length}장`,
    PAD,
    22
  );

  imposition.forEach((sheet, si) => {
    const yBase = PAD + header + si * (blockH + gap);
    ctx.fillStyle = "#333";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(sheet.sheetLabel, PAD, yBase);

    const fl = sheet.front.left;
    const fr = sheet.front.right;
    const bl = sheet.back.left;
    const br = sheet.back.right;

    drawImpositionFace(
      ctx,
      PAD,
      yBase + 8,
      pageW,
      pageH,
      pageImages[fl],
      pageImages[fr],
      `${fl + 1}p`,
      `${fr + 1}p`,
      scale
    );
    ctx.fillStyle = "#555";
    ctx.font = "11px sans-serif";
    ctx.fillText("앞면 (인쇄면 A)", PAD, yBase + 8 + sheetH + 12);

    drawImpositionFace(
      ctx,
      PAD,
      yBase + 8 + sheetH + faceGap + 14,
      pageW,
      pageH,
      pageImages[bl],
      pageImages[br],
      `${bl + 1}p`,
      `${br + 1}p`,
      scale
    );
    ctx.fillText("뒷면 (인쇄면 B)", PAD, yBase + 8 + sheetH + faceGap + 14 + sheetH + 12);
  });

  return canvas;
}

export function downloadCanvasPng(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename || "export.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
}

/**
 * Multi-page PDF from array of canvases (each canvas = one PDF page).
 * Requires window.PDFLib from CDN.
 */
export async function downloadCanvasesPdf(canvases, filename) {
  const PDFLib = window.PDFLib;
  if (!PDFLib) throw new Error("PDFLib CDN이 로드되지 않았습니다.");

  const pdf = await PDFLib.PDFDocument.create();
  for (const canvas of canvases) {
    const dataUrl = canvas.toDataURL("image/png");
    const png = await pdf.embedPng(dataUrl);
    const page = pdf.addPage([png.width, png.height]);
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: png.width,
      height: png.height,
    });
  }
  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "export.pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Split tall imposition canvas into one canvas per sheet block for PDF pages */
export function renderImpositionSheetCanvases({
  pageSize,
  imposition,
  pageImages,
  pageCount,
}) {
  const scale = PX_PER_MM;
  const pageW = pageSize.widthMm;
  const pageH = pageSize.heightMm;
  const sheetW = pageW * 2 * scale;
  const sheetH = pageH * scale;
  const faceGap = 20;
  const header = 40;
  const pad = 20;

  return imposition.map((sheet) => {
    const H = pad * 2 + header + sheetH * 2 + faceGap + 40;
    const W = pad * 2 + sheetW;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(W);
    canvas.height = Math.ceil(H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f0f2f5";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#111";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(
      `${sheet.sheetLabel} · 중철 ${pageCount}p`,
      pad,
      24
    );

    const fl = sheet.front.left;
    const fr = sheet.front.right;
    const bl = sheet.back.left;
    const br = sheet.back.right;

    drawImpositionFace(
      ctx,
      pad,
      header,
      pageW,
      pageH,
      pageImages[fl],
      pageImages[fr],
      `${fl + 1}p`,
      `${fr + 1}p`,
      scale
    );
    ctx.fillStyle = "#444";
    ctx.font = "11px sans-serif";
    ctx.fillText("앞면", pad, header + sheetH + 14);

    drawImpositionFace(
      ctx,
      pad,
      header + sheetH + faceGap + 18,
      pageW,
      pageH,
      pageImages[bl],
      pageImages[br],
      `${bl + 1}p`,
      `${br + 1}p`,
      scale
    );
    ctx.fillText("뒷면", pad, header + sheetH + faceGap + 18 + sheetH + 14);
    return canvas;
  });
}
