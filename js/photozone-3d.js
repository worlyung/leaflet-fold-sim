import { SceneViewer } from "./scene-viewer.js";
export function photozoneDimensions(o) {
  const section = Math.min(o.section, o.width / 4, o.height / 4);
  const margin = o.mount === "inset" ? section * 2 + 40 : 0;
  return { section, printWidth: Math.min(o.printWidth, o.width - margin), printHeight: Math.min(o.printHeight, o.height - margin),
    printZ: o.mount === "cover" ? section / 2 + 12 : 0 };
}
export class Photozone3DViewer extends SceneViewer {
  build(o) {
    this.clearRoot();
    const T = this.THREE, w = o.width, h = o.height, depth = o.depth;
    const { section: s, printWidth: pw, printHeight: ph, printZ } = photozoneDimensions(o);
    const metal = this.material(0xc5ced9); metal.metalness = 0.72; metal.roughness = 0.35;
    const foot = this.material(0x303b47), brace = this.material(0x8596a6);
    const truss = (a, b) => {
      const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
      const len = delta.length(), axis = delta.clone().normalize();
      const u = new T.Vector3(0, 0, 1), v = new T.Vector3().crossVectors(axis, u).normalize();
      const at = (t, i) => start.clone().addScaledVector(axis, t)
        .addScaledVector(u, [1, 1, -1, -1][i] * (s / 2 - 22))
        .addScaledVector(v, [1, -1, -1, 1][i] * (s / 2 - 22)).toArray();
      for (let i = 0; i < 4; i++) this.rod(at(0, i), at(len, i), 22, metal, this.root, "truss-chord");
      const segments = Math.max(1, Math.ceil(len / 350));
      for (let j = 0; j < segments; j++) for (let i = 0; i < 4; i++) {
        const k = (i + 1) % 4, t0 = len * j / segments, t1 = len * (j + 1) / segments;
        this.rod(at(t0, i), at(t0, k), 8, metal, this.root, "truss-crossbar");
        this.rod(at(t0, j % 2 ? k : i), at(t1, j % 2 ? i : k), 9, metal, this.root, "truss-diagonal");
      }
      for (let i = 0; i < 4; i++) this.rod(at(len, i), at(len, (i + 1) % 4), 8, metal);
    };
    truss([-w / 2 + s / 2, 35, 0], [-w / 2 + s / 2, h - s / 2, 0]);
    truss([w / 2 - s / 2, 35, 0], [w / 2 - s / 2, h - s / 2, 0]);
    truss([-w / 2 + s, h - s / 2, 0], [w / 2 - s, h - s / 2, 0]);
    for (const x of [-w / 2 + s / 2, w / 2 - s / 2]) {
      if (o.feet) this.box(s + 160, 35, depth + s, foot, this.root, "base-foot").position.set(x, 17.5, -depth / 2 + s / 2);
      if (o.braces) this.rod([x, h * 0.7, -s / 2], [x, 45, -depth + s / 2], 25, brace, this.root, "rear-brace");
      if (o.weights) this.box(s + 120, 160, 380, this.material(0x485253), this.root, "ballast").position.set(x, 115, -depth * 0.72);
    }
    if (o.showPrint) {
      const print = this.sheet(pw, ph, 3, o.front || this.label("PHOTO ZONE", "#497167", `${pw} × ${ph} mm`),
        o.back, this.root, "photozone-print", o.backColor);
      print.position.set(0, h / 2, printZ);
    }
    const floor = this.box(w * 1.8, 12, Math.max(depth * 2.7, w), this.material(0x202a35), this.root, "floor");
    floor.position.y = -12;
    if (o.person) {
      const height = o.personHeight, human = new T.Group(); human.name = "person";
      human.position.set(w / 2 + 250, 0, s / 2 + 170); this.root.add(human);
      const m = this.material(0xcbbb9f);
      const head = new T.Mesh(this.own(new T.SphereGeometry(height * 0.065, 16, 12)), m);
      head.position.y = height * 0.935; human.add(head);
      this.rod([0, height * 0.79, 0], [0, height * 0.89, 0], height * 0.035, m, human, "neck");
      this.box(height * 0.20, height * 0.32, height * 0.10, m, human).position.y = height * 0.64;
      for (const sign of [-1, 1]) {
        this.rod([sign * height * 0.05, height * 0.49, 0], [sign * height * 0.08, height * 0.03, 0], height * 0.037, m, human);
        this.rod([sign * height * 0.12, height * 0.78, 0], [sign * height * 0.15, height * 0.43, 0], height * 0.029, m, human);
      }
    }
    this.finishBuild();
  }
}
