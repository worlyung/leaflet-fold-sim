import { SceneViewer } from "./scene-viewer.js";
import { foldFaceLabel } from "./fold-faces.js";
const clamp = (v) => Math.min(1, Math.max(0, v));
export function foldAngles(id, count, t) {
  t = clamp(t);
  return Array.from({ length: count }, (_, i) => {
    if (!i) return 0;
    if (id === "cfold3" || id === "roll4") return Math.PI * clamp(t * (count - 1) - (count - 1 - i));
    return Math.PI * t * (i % 2 ? 1 : -1);
  });
}
/** Image is uploaded as a readable sheet viewed from the corresponding side. */
export function panelCrop(panel, width, height, back) {
  return { x: (back ? width - panel.x - panel.width : panel.x) / width,
    y: panel.y / height, w: panel.width / width, h: panel.height / height };
}
export class Leaflet3DViewer extends SceneViewer {
  constructor(container) { super(container); this.foldAmount = 0.65; }
  build(o) {
    this.clearRoot(); this.opts = o; this.hinges = [];
    const panels = o.panels;
    this.width = Math.max(...panels.map((p) => p.x + p.width));
    this.height = Math.max(...panels.map((p) => p.y + p.height));
    this.foldId = o.foldId;
    if (o.foldId === "french") this.buildCross();
    else if (o.foldId === "gate4") this.buildGate();
    else this.buildStrip();
    const amount = this.foldAmount;
    this.applyFold(amount);
    if (!this.hasFrame) { this.applyFold(0); this.frameCamera(); this.applyFold(amount); }
  }
  face(p, back) {
    const override = this.opts.panelImages?.[`${back ? "back" : "front"}-${p.index}`];
    if (override) return override;
    const image = back ? this.opts.backImage : this.opts.frontImage;
    if (!image) return this.label(foldFaceLabel(this.foldId, back ? "back" : "front", p.index), back ? "#775d4b" : "#44675f");
    const crop = panelCrop(p, this.width, this.height, back);
    const c = document.createElement("canvas");
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    c.width = Math.max(1, Math.min(2048, Math.round(iw * crop.w)));
    c.height = Math.max(1, Math.min(2048, Math.round(ih * crop.h)));
    c.getContext("2d").drawImage(image, crop.x * iw, crop.y * ih, crop.w * iw, crop.h * ih, 0, 0, c.width, c.height);
    return c;
  }
  panel(p, group, x = p.width / 2, y = -p.height / 2) {
    const mesh = this.sheet(p.width, p.height, 0.24, this.face(p, false), this.face(p, true), group, `panel-${p.index}`);
    mesh.position.set(x, y, 0); return mesh;
  }
  group(parent, x, y, z = 0) {
    const g = new this.THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
  }
  buildStrip() {
    const ps = this.opts.panels, horizontal = this.opts.foldAxis === "horizontal";
    let parent = this.group(this.root, -this.width / 2, this.height / 2);
    ps.forEach((p, i) => {
      const g = this.group(parent, i && !horizontal ? ps[i - 1].width : 0,
        i && horizontal ? -ps[i - 1].height : 0);
      this.panel(p, g); this.hinges.push({ group: g, axis: horizontal ? "x" : "y", index: i }); parent = g;
    });
  }
  buildGate() {
    const ps = this.opts.panels, horizontal = this.opts.foldAxis === "horizontal";
    const base = this.group(this.root, horizontal ? -this.width / 2 : -this.width / 2 + ps[0].width,
      horizontal ? this.height / 2 - ps[0].height : this.height / 2);
    if (horizontal) base.rotation.z = -Math.PI / 2;
    const lengths = ps.map((p) => horizontal ? p.height : p.width);
    const add = (p, group, sign = 1) => {
      if (horizontal) {
        const orient = this.group(group, 0, 0); orient.rotation.z = Math.PI / 2;
        this.panel(p, orient, p.width / 2, sign === 1 ? -p.height / 2 : p.height / 2);
      } else this.panel(p, group, sign * p.width / 2);
    };
    add(ps[1], base);
    const left = this.group(base, 0, 0); add(ps[0], left, -1);
    const mid = this.group(base, lengths[1], 0); add(ps[2], mid);
    const right = this.group(mid, lengths[2], 0); add(ps[3], right);
    this.gate = { left, mid, right };
  }
  buildCross() {
    const ps = this.opts.panels, w = this.width / 2, h = this.height / 2;
    const base = this.group(this.root, -w, h);
    this.panel(ps[0], base);
    const right = this.group(base, w, 0); this.panel(ps[1], right);
    const bottomLeft = this.group(base, 0, -h); this.panel(ps[2], bottomLeft);
    const bottomRight = this.group(right, 0, -h); this.panel(ps[3], bottomRight);
    this.cross = { right, bottomLeft, bottomRight };
  }
  applyFold(t) {
    this.foldAmount = clamp(t);
    const a = Math.PI;
    if (this.foldId === "gate4") {
      const wing = clamp(t * 2), mid = clamp(t * 2 - 1);
      this.gate.left.rotation.y = a * wing;
      this.gate.right.rotation.y = -a * wing;
      this.gate.mid.rotation.y = -a * mid;
      this.gate.left.position.z = this.gate.right.position.z = 0.3 * wing;
      this.gate.mid.position.z = 0.9 * mid;
    } else if (this.foldId === "french") {
      const first = clamp(t * 2), second = clamp(t * 2 - 1);
      this.cross.bottomLeft.rotation.x = this.cross.bottomRight.rotation.x = -a * first;
      this.cross.bottomLeft.position.z = this.cross.bottomRight.position.z = 0.3 * first;
      this.cross.right.rotation.y = -a * second; this.cross.right.position.z = 0.8 * second;
    } else {
      const angles = foldAngles(this.foldId, this.hinges.length, t);
      this.hinges.forEach(({ group, axis, index }) => {
        const angle = angles[index]; group.rotation[axis] = -angle;
        group.position.z = index ? Math.sign(angle) * (0.28 + 0.15 * (this.hinges.length - index)) * Math.abs(angle) / a : 0;
      });
    }
  }
}
