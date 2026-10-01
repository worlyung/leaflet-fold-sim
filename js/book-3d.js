import { SceneViewer } from "./scene-viewer.js";
export const BOOK_BINDINGS = ["saddle_stitch", "perfect_bound", "hardcover", "round_hardcover", "spiral", "wire"];
export function bookDimensions(o) {
  const hard = ["hardcover", "round_hardcover"].includes(o.binding);
  const ring = ["spiral", "wire"].includes(o.binding);
  const cover = o.binding === "saddle_stitch" ? Math.min(o.coverThickness, 0.5) : o.coverThickness;
  const leaves = Math.max(1, Math.ceil((o.pages?.length ?? 2) / 2));
  const thickness = o.paperThickness != null
    ? cover * 2 + leaves * o.paperThickness : o.thickness;
  return { hard, ring, cover, overhang: hard ? 3 : 0,
    thickness: Math.max(thickness, cover * 2 + 0.05), maxOpen: ring ? 360 : 180 };
}
export class Book3DViewer extends SceneViewer {
  build(o) {
    if (o.brochure) { this.buildBrochure(o); return; }
    this.clearRoot(); this.opts = o; this.leaves = [];
    const T = this.THREE, w = o.width, h = o.height;
    const { hard, ring, cover: c, overhang: extra, thickness: d } = bookDimensions(o);
    this.dimensions = bookDimensions(o);
    const paperD = d - c * 2, n = Math.max(1, Math.ceil(o.pages.length / 2));
    const left = -w / 2, pivotX = left + (ring ? 5 : 0);
    const front = o.front || this.label("앞표지", "#346458", `${w} × ${h} mm`);
    const back = o.back || this.label("뒷표지", "#264b44");
    const frontPivot = new T.Group(); frontPivot.position.set(pivotX, 0, d / 2 - c / 2);
    this.root.add(frontPivot); this.frontPivot = frontPivot;
    const frontCover = this.sheet(w + extra, h + 2 * extra, c, front, null, frontPivot, "front-cover");
    frontCover.position.x = (w + extra) / 2 - (ring ? 5 : 0);
    const backCover = this.sheet(w + extra, h + 2 * extra, c, null, back, this.root, "back-cover");
    backCover.position.set(extra / 2, 0, -d / 2 + c / 2);
    if (!ring && o.binding !== "saddle_stitch") {
      const spineImage = o.spine || this.label("책등", "#244c43");
      if (o.binding === "round_hardcover") {
        // The left half of a vertical cylinder forms a rounded spine.
        const geo = this.own(new T.CylinderGeometry(d / 2, d / 2, h + 2 * extra, 32, 1, false, Math.PI, Math.PI));
        const end = this.material(0x305648);
        const spine = new T.Mesh(geo, [this.material(0x305648, spineImage), end, end]);
        spine.name = "round-spine"; spine.position.x = left; this.root.add(spine);
      } else {
        const m = this.material(0x305648), printed = this.material(0xffffff, spineImage);
        this.box(Math.max(c, 0.5), h + 2 * extra, d, [m, printed, m, m, m, m], this.root, "spine")
          .position.x = left - Math.max(c, 0.5) / 2;
      }
    }
    const paper = this.material(0xe8e2d6);
    for (let i = 0; i < n; i++) {
      const leaf = new T.Group();
      const z = paperD / 2 - (i + 0.5) * paperD / n;
      leaf.position.set(pivotX, 0, z); this.root.add(leaf);
      const labelScale = n > 32 ? 0.25 : 1;
      const frontPage = o.pages[i * 2] || this.label(`${i * 2 + 1}`, "#b7aa8f", "내지", labelScale);
      const backPage = o.pages[i * 2 + 1] || this.label(`${i * 2 + 2}`, "#b7aa8f", "내지", labelScale);
      const mesh = this.sheet(w - (ring ? 5 : 1), h - 1, paperD / n * 0.94,
        frontPage, backPage, leaf, `leaf-${i}`);
      mesh.position.x = (w - (ring ? 5 : 1)) / 2;
      if (!ring) {
        mesh.geometry = this.own(new T.BoxGeometry(w - 1, h - 1, paperD / n * 0.94, 32, 1, 1));
      }
      this.leaves.push({ group: leaf, z, mesh,
        rest: mesh.geometry.attributes.position.array.slice() });
    }
    if (ring) {
      const metal = this.material(0xb3bcc5); metal.metalness = 0.85; metal.roughness = 0.3;
      const count = Math.max(4, Math.min(24, Math.floor(h / 15)));
      for (let i = 0; i < count; i++) {
        const y = -h / 2 + (i + 0.5) * h / count;
        const positions = o.binding === "wire" ? [y - 1.4, y + 1.4] : [y];
        for (const ry of positions) {
          const geo = this.own(new T.TorusGeometry(d / 2 + 4, 0.65, 6, 32));
          const r = new T.Mesh(geo, metal); r.rotation.x = Math.PI / 2;
          r.position.set(pivotX, ry, 0); r.name = "binding-ring"; this.root.add(r);
        }
        // Visible dark punching marks on both covers; paired marks for wire binding.
        for (const py of positions) {
          const hole = this.own(new T.CircleGeometry(1.6, 10));
          for (const [parent, z, flip] of [[frontPivot, c / 2 + 0.02, false], [this.root, -d / 2 - 0.02, true]]) {
            const mark = new T.Mesh(hole, this.material(0x1b2128));
            mark.position.set(parent === frontPivot ? 1 : pivotX + 1, py, z);
            if (flip) mark.rotation.y = Math.PI;
            mark.name = "punch-hole"; parent.add(mark);
          }
        }
      }
    } else if (o.binding === "saddle_stitch") {
      const metal = this.material(0xb6bec7); metal.metalness = 0.8;
      for (const y of [-h * 0.25, h * 0.25]) {
        this.rod([left - 0.6, y - 6, -d / 2], [left - 0.6, y + 6, -d / 2], 0.45, metal, this.root, "staple");
        for (const yy of [y - 6, y + 6]) this.rod([left - 0.6, yy, -d / 2], [left - 0.6, yy, d / 2], 0.45, metal, this.root, "staple-leg");
      }
    }
    this.setOpen(o.open, o.turn);
    // Fit a fully opened book once, so opening it later does not clip the covers.
    if (!this.hasFrame) {
      this.setOpen(180, 0.5); this.frameCamera(); this.setOpen(o.open, o.turn);
    }
  }
  buildBrochure(o) {
    this.clearRoot(); this.opts = o; this.leaves = [];
    const T = this.THREE, pages = [o.front, ...o.pages, o.back];
    const count = pages.length / 2, paper = o.paperThickness || 0.12, cover = Math.min(o.coverThickness, 0.5);
    const depth = cover * 2 + Math.max(0, count - 2) * paper;
    this.dimensions = { thickness: depth, cover, maxOpen: 180, ring: false };
    let cursor = depth / 2;
    for (let i = 0; i < count; i++) {
      const thickness = i === 0 || i === count - 1 ? cover : paper;
      const z = cursor - thickness / 2; cursor -= thickness;
      // The two halves of each nested sheet meet at the same centre crease.
      const hinge = -Math.min(i, count - 1 - i) * paper * 0.4;
      const mesh = this.sheet(o.width, o.height, thickness,
        pages[2*i] || this.label(`${2*i+1}`, "#b7aa8f", i === 0 ? "앞표지" : "내지"),
        pages[2*i+1] || this.label(`${2*i+2}`, "#b7aa8f", i === count-1 ? "뒤표지" : "내지"),
        this.root, `brochure-half-${i}`);
      mesh.geometry = this.own(new T.BoxGeometry(o.width, o.height, thickness, 48, 1, 1));
      this.leaves.push({ mesh, z, hinge, rest: mesh.geometry.attributes.position.array.slice() });
    }
    const metal = this.material(0xb6bec7);
    for (const y of [-o.height/4, o.height/4])
      this.rod([-o.width/2-0.3,y-5,0],[-o.width/2-0.3,y+5,0],0.25,metal,this.root,"staple");
    this.setOpen(o.open,o.turn);
    if (!this.hasFrame) { this.setOpen(180,0.5); this.frameCamera(); this.setOpen(o.open,o.turn); }
  }
  setOpen(degrees, turn = this.turn || 0) {
    if (this.opts.brochure) {
      this.open = Math.max(0,Math.min(180,degrees)); this.turn = Math.max(0,Math.min(1,turn));
      const count = this.leaves.length;
      this.leaves.forEach(({mesh,z,hinge,rest},i) => {
        const fraction = i === 0 ? 1 : i === count-1 ? 0 : Math.max(0,Math.min(1,this.turn*(count-2)-(i-1)));
        const a = this.open*Math.PI/180*fraction, sin=Math.sin(a), cos=Math.cos(a);
        const pos=mesh.geometry.attributes.position;
        for(let j=0;j<pos.count;j++) {
          const x=rest[3*j]+this.opts.width/2, localZ=rest[3*j+2];
          const t=Math.min(1,x/8), blend=t*t*(3-2*t);
          const dz=localZ+(z-hinge)*blend;
          pos.setXYZ(j,-this.opts.width/2+x*cos-dz*sin,rest[3*j+1],hinge+x*sin+dz*cos);
        }
        pos.needsUpdate=true; mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
      });
      return;
    }
    const limit = this.dimensions.maxOpen;
    const angle = Math.min(limit, Math.max(0, degrees)) * Math.PI / 180;
    this.open = degrees; this.turn = Math.min(1, Math.max(0, turn));
    this.frontPivot.rotation.y = -angle;
    const n = this.leaves.length, d = this.dimensions.thickness;
    const wrap = this.dimensions.ring ? Math.max(0, angle / Math.PI - 1) : 0;
    this.frontPivot.position.z = d / 2 - this.dimensions.cover / 2 - wrap * (d + this.dimensions.cover);
    this.leaves.forEach(({ group, z, mesh, rest }, i) => {
      const p = Math.min(1, Math.max(0, this.turn * n - i));
      group.rotation.y = this.dimensions.ring ? -angle * p : 0;
      // Glued/sewn leaves stay attached at their original spine hinge.
      // Only ring bindings can travel around the binding when turned.
      group.position.z = this.dimensions.ring
        ? z + p * (d - 2 * z) * Math.sin(angle / 2) - wrap * p * (d + this.dimensions.cover)
        : z;
      if (!this.dimensions.ring) {
        // Bend the binding margin while the outer page stack follows the cover.
        // Separate parallel layers along their rotated normal, including at 90°.
        const a = angle * p, sin = Math.sin(a), cos = Math.cos(a);
        const hingeZ = d / 2 - this.dimensions.cover / 2;
        const margin = Math.min(24, this.opts.width * 0.18);
        const pos = mesh.geometry.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          const x = rest[j * 3] + mesh.position.x;
          const localZ = rest[j * 3 + 2], dz = z + localZ - hingeZ;
          const t = Math.min(1, Math.max(0, x / margin));
          const blend = t * t * (3 - 2 * t);
          pos.setXYZ(j, x + blend * (x * cos - dz * sin - x) - mesh.position.x,
            rest[j * 3 + 1], localZ + blend * (hingeZ + x * sin + dz * cos - z - localZ));
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
      }
    });
  }
}
