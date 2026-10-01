/** Shared camera, resources and interaction for all physical mockups. Units: mm. */
export class SceneViewer {
  constructor(container) {
    this.container = container;
    this.THREE = window.THREE;
    const T = this.THREE;
    if (!T || !window.OrbitControls) throw new Error("3D 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x131923);
    this.root = new T.Group();
    this.scene.add(this.root);
    this.camera = new T.PerspectiveCamera(38, 1, 0.1, 100000);
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.controls = new window.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.scene.add(new T.HemisphereLight(0xffffff, 0x667181, 2.3));
    const key = new T.DirectionalLight(0xffffff, 2.5);
    key.position.set(400, 700, 1000);
    const fill = new T.DirectionalLight(0xb9d3ff, 1.2);
    fill.position.set(-600, 200, -800);
    this.scene.add(key, fill);
    this.resources = new Set();
    this.hasFrame = false;
    this.autoRotate = false;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate = () => {
      this.raf = requestAnimationFrame(this.animate);
      if (!this.container.getClientRects().length) return;
      this.controls.autoRotate = this.autoRotate;
      this.controls.autoRotateSpeed = 1.5;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.animate();
  }
  own(resource) { this.resources.add(resource); return resource; }
  clearRoot() {
    this.root.clear();
    this.resources.forEach((r) => r.dispose?.());
    this.resources.clear();
  }
  texture(image) {
    const t = this.own(new this.THREE.Texture(image));
    t.colorSpace = this.THREE.SRGBColorSpace;
    t.needsUpdate = true;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  material(color, image = null) {
    return this.own(new this.THREE.MeshStandardMaterial({ color: image ? 0xffffff : color,
      map: image ? this.texture(image) : null, roughness: 0.8, metalness: 0.04 }));
  }
  label(text, color = "#305c70", detail = "", scale = 1) {
    const c = document.createElement("canvas"); c.width = 512 * scale; c.height = 720 * scale;
    const ctx = c.getContext("2d"); ctx.scale(scale, scale); ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 720);
    ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 2; ctx.strokeRect(30, 30, 452, 660);
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.font = "bold 38px sans-serif"; ctx.fillText(text, 256, 325);
    ctx.font = "22px sans-serif"; ctx.fillText(detail, 256, 380);
    ctx.font = "26px sans-serif"; ctx.fillText("↑ 위", 256, 95);
    return c;
  }
  box(w, h, d, materials, parent = this.root, name = "") {
    const mesh = new this.THREE.Mesh(this.own(new this.THREE.BoxGeometry(w, h, d)), materials);
    mesh.name = name; parent.add(mesh); return mesh;
  }
  sheet(w, h, d, front, back, parent = this.root, name = "sheet", color = 0xf1ece2) {
    const edge = this.material(color);
    return this.box(w, h, d, [edge, edge, edge, edge,
      this.material(color, front), this.material(color, back)], parent, name);
  }
  rod(a, b, radius, mat, parent = this.root, name = "rod") {
    const T = this.THREE, start = new T.Vector3(...a), end = new T.Vector3(...b);
    const delta = end.clone().sub(start);
    const mesh = new T.Mesh(this.own(new T.CylinderGeometry(radius, radius, delta.length(), 8)), mat);
    mesh.position.copy(start.add(end).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    mesh.name = name; parent.add(mesh); return mesh;
  }
  finishBuild() { if (!this.hasFrame) this.frameCamera(); }
  frameCamera(direction = "iso") {
    const T = this.THREE;
    this.root.updateMatrixWorld(true);
    const box = new T.Box3();
    // The floor provides context, but must not shrink the product in the viewport.
    for (const child of this.root.children) {
      if (child.name !== "floor") box.expandByObject(child);
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    const r = Math.max(size.length() / 2, 1);
    const fov = Math.min(this.camera.fov * Math.PI / 180,
      2 * Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect));
    const dist = r / Math.sin(fov / 2) * 1.15;
    const directions = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0],
      right: [1, 0, 0], top: [0, 1, 0.001], iso: [0.7, 0.4, 1] };
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new T.Vector3(...(directions[direction] || directions.iso)).normalize().multiplyScalar(dist));
    this.camera.near = Math.max(0.05, r / 100); this.camera.far = Math.max(10000, r * 100);
    this.controls.minDistance = Math.max(1, r * 0.05); this.controls.maxDistance = r * 30;
    this.camera.updateProjectionMatrix(); this.controls.update(); this.hasFrame = true;
  }
  setRotation(x, y, z) { this.root.rotation.set(...[x, y, z].map((v) => v * Math.PI / 180)); }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    const halfFov = this.camera.fov * Math.PI / 360;
    const oldFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect));
    const newFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * w / h));
    if (this.hasFrame && this.controls) {
      this.camera.position.sub(this.controls.target).multiplyScalar(Math.sin(oldFov) / Math.sin(newFov)).add(this.controls.target);
    }
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
  }
  dispose() {
    cancelAnimationFrame(this.raf); this.resizeObserver.disconnect(); this.controls.dispose();
    this.clearRoot(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
