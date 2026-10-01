import { SceneViewer } from "./scene-viewer.js";
export class Poster3DViewer extends SceneViewer {
  build(o) {
    this.clearRoot();
    this.sheet(o.width, o.height, 0.3,
      o.front || this.label("포스터", "#af6747", `${o.width} × ${o.height} mm`), o.back,
      this.root, "poster", o.backColor);
    this.finishBuild();
  }
}
