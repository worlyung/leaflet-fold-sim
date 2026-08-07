/**
 * Node smoke tests: panel math + saddle imposition + fixtures present.
 * Run: node scripts/smoke-test.mjs
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const u = (p) => pathToFileURL(join(root, p)).href;

const { computePanelSizes, computePanels, approxFinishedSize } = await import(
  u("js/panel-math.js")
);
const {
  buildSaddleImposition,
  formatSide,
  suggestParentSheet,
  buildPerfectBoundLeaves,
} = await import(u("js/imposition.js"));
const { normalizePageCount, buildSpreads } = await import(u("js/booklet.js"));
const shopMod = await import(u("js/shop-templates.js"));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("OK  ", msg);
  }
}

// presets
const presets = JSON.parse(readFileSync(join(root, "presets.json"), "utf8"));
assert(presets.version === "1.3.0", `presets version ${presets.version}`);

// panel math
const c = computePanelSizes(210, 3, "c_fold_inner_narrow", 2);
const csum = c.reduce((a, b) => a + b, 0);
assert(Math.abs(csum - 210) < 0.02, `cfold sum=${csum} panels=${c.join(",")}`);
assert(c[2] < c[0], "cfold inner narrower than outer");

const half = computePanels(
  { widthMm: 210, heightMm: 297 },
  { panelCount: 2, algorithm: "equal" },
  "vertical",
  2
);
const fin = approxFinishedSize(
  { widthMm: 210, heightMm: 297 },
  { panelCount: 2 },
  "vertical",
  half
);
assert(fin.widthMm === 105 && fin.heightMm === 297, `half finished ${JSON.stringify(fin)}`);

// booklet page count
assert(normalizePageCount(10, "saddle_stitch") === 12, "saddle rounds to 12");
assert(normalizePageCount(9, "perfect_bound") === 10, "perfect even");

// spreads
const sp = buildSpreads(8);
assert(sp[0].right === 0 && sp[0].left === null, "cover spread");
assert(sp.length >= 4, `spreads ${sp.length}`);

// imposition 8 pages
const imp = buildSaddleImposition(8);
assert(imp.length === 2, "2 sheets for 8p");
// sheet0 front: left=7 (p8), right=0 (p1)
assert(
  imp[0].front.left === 7 && imp[0].front.right === 0,
  `outer front ${formatSide(imp[0].front, 8)}`
);
assert(
  imp[0].back.left === 1 && imp[0].back.right === 6,
  `outer back ${formatSide(imp[0].back, 8)}`
);
assert(
  imp[1].front.left === 5 && imp[1].front.right === 2,
  `inner front ${formatSide(imp[1].front, 8)}`
);
assert(
  imp[1].back.left === 3 && imp[1].back.right === 4,
  `inner back ${formatSide(imp[1].back, 8)}`
);

// 12 pages
const imp12 = buildSaddleImposition(12);
assert(imp12.length === 3, "3 sheets for 12p");
assert(imp12[0].front.right === 0, "12p cover on outer front-right");

// fixtures
const fixDir = join(root, "fixtures");
assert(existsSync(fixDir), "fixtures/ exists");
const jpgs = readdirSync(fixDir).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
assert(jpgs.length >= 4, `fixtures images >=4 (got ${jpgs.length}: ${jpgs.join(",")})`);

// parent sheet mapping
const a5 = suggestParentSheet({ widthMm: 148, heightMm: 210 });
assert(a5.suggested?.id === "a4", `A5→parent ${a5.suggested?.id}`);
const a4 = suggestParentSheet({ widthMm: 210, heightMm: 297 });
assert(a4.suggested?.id === "a3", `A4→parent ${a4.suggested?.id}`);

// perfect bound leaves
const leaves = buildPerfectBoundLeaves(8);
assert(leaves.length === 4, "8p → 4 leaves");
assert(leaves[0].front === 0 && leaves[0].back === 1, "leaf1 = 1|2");

assert(typeof shopMod.exportTemplatesPayload === "function", "exportTemplatesPayload");
assert(typeof shopMod.importTemplatesPayload === "function", "importTemplatesPayload");
assert(typeof shopMod.downloadTemplatesJson === "function", "downloadTemplatesJson");

// export module loads
try {
  await import(u("js/export-flat.js"));
  assert(true, "export-flat.js loads");
} catch (e) {
  assert(false, `export-flat load: ${e.message}`);
}

console.log(failed ? `\n${failed} failed` : "\nAll smoke tests passed.");
process.exit(failed ? 1 : 0);
