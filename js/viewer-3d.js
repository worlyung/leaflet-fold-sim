/**
 * Three.js fold / orbit viewer for leaflet panels.
 * Expects THREE + OrbitControls as globals (loaded via importmap or script).
 */

const PX_PER_MM = 0.12; // world units per mm

export class Leaflet3DViewer {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.THREE = window.THREE;
    if (!this.THREE) {
      throw new Error("THREE is not loaded");
    }

    this.scene = new this.THREE.Scene();
    this.scene.background = new this.THREE.Color(0x0f1218);

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;

    this.camera = new this.THREE.PerspectiveCamera(40, w / h, 0.1, 5000);
    this.camera.position.set(80, 60, 160);

    this.renderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    const amb = new this.THREE.AmbientLight(0xffffff, 0.85);
    const dir = new this.THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(40, 80, 60);
    this.scene.add(amb, dir);

    const floor = new this.THREE.GridHelper(200, 20, 0x2a3344, 0x1c2230);
    floor.position.y = -0.5;
    this.scene.add(floor);

    this.root = new this.THREE.Group();
    this.scene.add(this.root);

    const Controls = window.OrbitControls || this.THREE.OrbitControls;
    if (Controls) {
      this.controls = new Controls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.target.set(0, 30, 0);
    } else {
      this.controls = null;
    }

    this.hinges = [];
    this.textures = { front: null, back: null };
    this.panelData = [];
    this.foldId = "half";
    this.foldAmount = 0; // 0 open … 1 fully folded
    this._raf = 0;
    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this.animate();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.controls?.dispose?.();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * @param {object} opts
   * @param {Array<{width:number,height:number,index:number}>} opts.panels - mm
   * @param {string} opts.foldId
   * @param {string} opts.foldAxis vertical|horizontal
   * @param {HTMLImageElement|null} opts.frontImage
   * @param {HTMLImageElement|null} opts.backImage
   * @param {Record<string, HTMLImageElement|null>} opts.panelImages - optional per-panel overrides key "front-0"
   */
  build(opts) {
    this.clearRoot();
    this.panelData = opts.panels || [];
    this.foldId = opts.foldId || "half";
    this.foldAxis = opts.foldAxis || "vertical";
    this.panelImages = opts.panelImages || {};

    this.textures.front = opts.frontImage ? this.imageToTexture(opts.frontImage) : null;
    this.textures.back = opts.backImage ? this.imageToTexture(opts.backImage) : null;

    if (this.foldAxis === "horizontal") {
      this.buildHorizontalStrip();
    } else {
      this.buildVerticalStrip();
    }

    this.applyFold(this.foldAmount);
    this.frameCamera();
  }

  clearRoot() {
    while (this.root.children.length) {
      const ch = this.root.children[0];
      this.root.remove(ch);
      ch.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.hinges = [];
  }

  imageToTexture(img) {
    const tex = new this.THREE.Texture(img);
    tex.colorSpace = this.THREE.SRGBColorSpace || this.THREE.sRGBEncoding;
    if (tex.colorSpace === undefined && this.THREE.sRGBEncoding !== undefined) {
      tex.encoding = this.THREE.sRGBEncoding;
    }
    tex.needsUpdate = true;
    tex.flipY = true;
    return tex;
  }

  makePanelMesh(wMm, hMm, panelIndex, totalW, offsetXMm) {
    const w = wMm * PX_PER_MM;
    const h = hMm * PX_PER_MM;
    const geo = new this.THREE.BoxGeometry(w, h, 0.35);

    const frontMat = this.makeFaceMaterial(true, panelIndex, totalW, offsetXMm, wMm, hMm);
    const backMat = this.makeFaceMaterial(false, panelIndex, totalW, offsetXMm, wMm, hMm);
    const edgeMat = new this.THREE.MeshStandardMaterial({
      color: 0xe8e4dc,
      roughness: 0.9,
      metalness: 0,
    });

    // Box materials: +x,-x,+y,-y,+z,-z
    const materials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
    const mesh = new this.THREE.Mesh(geo, materials);
    // shift so left edge at 0 for hinge convenience
    mesh.position.x = w / 2;
    mesh.position.y = h / 2;
    return mesh;
  }

  makeFaceMaterial(isFront, panelIndex, totalW, offsetXMm, wMm, hMm) {
    const key = `${isFront ? "front" : "back"}-${panelIndex}`;
    const override = this.panelImages[key];
    let map = null;

    if (override) {
      map = this.imageToTexture(override);
    } else {
      const base = isFront ? this.textures.front : this.textures.back;
      if (base) {
        // clone texture with UV offset for panel slice
        map = base.clone();
        map.needsUpdate = true;
        const u0 = offsetXMm / totalW;
        const u1 = (offsetXMm + wMm) / totalW;
        map.offset.set(u0, 0);
        map.repeat.set(u1 - u0, 1);
        map.wrapS = this.THREE.ClampToEdgeWrapping;
        map.wrapT = this.THREE.ClampToEdgeWrapping;
      }
    }

    if (map) {
      return new this.THREE.MeshStandardMaterial({
        map,
        roughness: 0.75,
        metalness: 0.02,
        side: this.THREE.FrontSide,
      });
    }

    // placeholder colors alternating
    const colors = [0xf4f6fa, 0xe8ecf4, 0xdde3ee, 0xd0d8e6];
    return new this.THREE.MeshStandardMaterial({
      color: colors[panelIndex % colors.length],
      roughness: 0.85,
      metalness: 0,
    });
  }

  buildVerticalStrip() {
    const panels = this.panelData;
    if (!panels.length) return;

    const totalW = panels.reduce((s, p) => s + p.width, 0);
    const hMm = panels[0].height;

    // Nested hinges: root -> hinge0(panel0) -> hinge1(panel1) -> ...
    // Each hinge at left edge of its panel; rotates around Y.
    let parent = this.root;
    let offsetAcc = 0;

    // Center the whole strip on origin later via root position
    const group = new this.THREE.Group();
    this.root.add(group);
    parent = group;

    panels.forEach((p, i) => {
      const hinge = new this.THREE.Group();
      hinge.position.x = i === 0 ? 0 : panels[i - 1].width * PX_PER_MM;
      parent.add(hinge);

      const mesh = this.makePanelMesh(p.width, p.height, i, totalW, offsetAcc);
      hinge.add(mesh);

      this.hinges.push({
        hinge,
        index: i,
        widthMm: p.width,
        heightMm: p.height,
      });

      parent = hinge;
      offsetAcc += p.width;
    });

    // shift so center of open sheet at origin
    group.position.x = (-totalW * PX_PER_MM) / 2;
    group.position.y = (-hMm * PX_PER_MM) / 2 + 30;
    this._stripGroup = group;
    this._totalWmm = totalW;
    this._totalHmm = hMm;
  }

  buildHorizontalStrip() {
    // Similar but hinges around X, stacked in Y
    const panels = this.panelData;
    if (!panels.length) return;
    const totalH = panels.reduce((s, p) => s + p.height, 0);
    const wMm = panels[0].width;
    const group = new this.THREE.Group();
    this.root.add(group);
    let parent = group;
    let offsetAcc = 0;

    panels.forEach((p, i) => {
      const hinge = new this.THREE.Group();
      hinge.position.y = i === 0 ? 0 : panels[i - 1].height * PX_PER_MM;
      parent.add(hinge);

      // reuse mesh builder — for horizontal we still use box; offset UV differently simplified
      const mesh = this.makePanelMesh(p.width, p.height, i, wMm, 0);
      // remap: for horizontal UV use height slice — approximate solid color if complex
      hinge.add(mesh);
      this.hinges.push({ hinge, index: i, widthMm: p.width, heightMm: p.height });
      parent = hinge;
      offsetAcc += p.height;
    });

    group.position.x = (-wMm * PX_PER_MM) / 2;
    group.position.y = (-totalH * PX_PER_MM) / 2 + 30;
    this._stripGroup = group;
    this._totalWmm = wMm;
    this._totalHmm = totalH;
  }

  /**
   * @param {number} t 0 = flat open, 1 = fully folded
   */
  applyFold(t) {
    this.foldAmount = Math.min(1, Math.max(0, t));
    const maxAngle = (Math.PI * 175) / 180; // almost closed
    const a = this.foldAmount * maxAngle;
    const id = this.foldId;
    const horizontal = this.foldAxis === "horizontal";
    const axis = horizontal ? "x" : "y";

    this.hinges.forEach((item, i) => {
      if (i === 0) {
        item.hinge.rotation.x = 0;
        item.hinge.rotation.y = 0;
        return;
      }

      let sign = 1;
      if (id === "zfold3" || id === "accordion4") {
        // alternating
        sign = i % 2 === 1 ? 1 : -1;
      } else if (id === "cfold3" || id === "roll4" || id === "half") {
        // all same direction (roll in)
        sign = 1;
      } else if (id === "gate4") {
        // left wing opens one way, right the other — approximate with nested chain
        sign = i <= 2 ? 1 : -1;
      }

      // For nested hinges, angle per hinge is the relative fold
      const angle = sign * a;
      if (axis === "y") {
        item.hinge.rotation.y = -angle; // negative so folds toward viewer/back consistently
        item.hinge.rotation.x = 0;
      } else {
        item.hinge.rotation.x = angle;
        item.hinge.rotation.y = 0;
      }
    });

    // Half fold: only one hinge between 2 panels — already handled
    // Z-fold: hinge1 +, hinge2 - — alternating sign handles it
  }

  frameCamera() {
    const w = (this._totalWmm || 210) * PX_PER_MM;
    const h = (this._totalHmm || 297) * PX_PER_MM;
    const dist = Math.max(w, h) * 1.8 + 40;
    this.camera.position.set(dist * 0.55, dist * 0.4, dist * 0.85);
    if (this.controls) {
      this.controls.target.set(0, 30, 0);
      this.controls.update();
    }
  }

  animate = () => {
    this._raf = requestAnimationFrame(this.animate);
    // 숨겨진 뷰의 캔버스를 매 프레임 렌더하지 않는다 (display:none이면 offsetParent가 null)
    // ponytail: position:fixed 조상이 생기면 이 판정이 깨진다 — 그때 checkVisibility()로 교체
    if (!this.container.offsetParent) return;
    this.controls?.update?.();
    this.renderer.render(this.scene, this.camera);
  };
}
