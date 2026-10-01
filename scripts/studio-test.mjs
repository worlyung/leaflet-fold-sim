import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assembleBookPages } from "../js/booklet.js";
import { computePanels, computePanelSizes, approxFinishedSize } from "../js/panel-math.js";
import { drawFoldSheet } from "../js/export-flat.js";
import { panelCrop, foldAngles, Leaflet3DViewer } from "../js/viewer-3d.js";
import { bookDimensions, BOOK_BINDINGS, Book3DViewer } from "../js/book-3d.js";
import { photozoneDimensions, Photozone3DViewer } from "../js/photozone-3d.js";
import { Poster3DViewer } from "../js/poster-3d.js";
import { foldCovers } from "../js/fold-faces.js";

assert.deepEqual(assembleBookPages(["cover","p1","back"],true,"saddle_stitch"),["cover","p1",null,"back"]);
assert.deepEqual(assembleBookPages(["p1","p2"],false,"perfect_bound"),[null,"p1","p2",null]);
assert.throws(() => assembleBookPages(Array(511).fill("page"),false,"perfect_bound"));
assert.equal(assembleBookPages(Array(512).fill("page"),true,"hardcover").length,512);
assert.throws(() => assembleBookPages(Array(65).fill("page"),true,"saddle_stitch"));
assert.equal(assembleBookPages(Array(64).fill("page"),true,"saddle_stitch").length,64);
assert.equal(foldAngles("cfold3",3,0.5)[1],0);
assert.equal(foldAngles("cfold3",3,0.5)[2],Math.PI);
assert(foldAngles("zfold3",3,0.5)[1] * foldAngles("zfold3",3,0.5)[2] < 0);
assert.deepEqual(panelCrop({x:0,y:100,width:200,height:100},200,300,false), {x:0,y:1/3,w:1,h:1/3});
assert.equal(panelCrop({x:0,y:0,width:100,height:300},300,300,true).x,2/3);
const roll = computePanelSizes(420,4,"roll_progressive_narrow",2);
assert.deepEqual(roll,[108,106,104,102]);
const presets = JSON.parse(readFileSync(new URL("../presets.json",import.meta.url)));
const sheet = {widthMm:420,heightMm:297};
const french = presets.folds.find((f) => f.id === "french");
const quadrants = computePanels(sheet,french,"vertical",2);
assert.equal(quadrants.reduce((s,p) => s+p.width*p.height,0),420*297);
assert.deepEqual(approxFinishedSize(sheet,french,"vertical",quadrants), {widthMm:210,heightMm:148.5});
const draws=[];
const ctx=new Proxy({}, {get:(_t,key)=>key==="drawImage" ? (...args)=>draws.push(args) : ()=>{},set:()=>true});
drawFoldSheet(ctx,{panels:quadrants,sheet,side:"back",foldAxis:"vertical",images:{back:{naturalWidth:840,naturalHeight:594}},scale:1});
assert.equal(draws.length,4);
assert.equal(new Set(draws.map((a)=>`${a[5]},${a[6]}`)).size,4,"cross-fold export quadrants must not overlap");
assert.equal(draws[0][1],420,"back crop is mirrored spatially, not mirrored text");
assert.equal(bookDimensions({binding:"wire",coverThickness:1,thickness:12}).maxOpen,360);
assert.equal(bookDimensions({binding:"hardcover",coverThickness:2,thickness:1}).thickness,4.05);
for (const count of [4,12,64]) {
  const d=bookDimensions({binding:"hardcover",coverThickness:1.5,paperThickness:0.12,pages:Array(count-2).fill(null)});
  assert(Math.abs(d.thickness-(3+(count-2)/2*0.12))<1e-8,"page count determines book thickness");
}
assert.equal(photozoneDimensions({width:1000,height:1000,section:600,printWidth:4000,printHeight:2500,mount:"cover"}).printWidth,1000);
console.log("PASS: cover pagination, overflow, fold sequencing, back/horizontal crop, cross fold, dimensions");

// Optional real Three.js geometry checks; use the same pinned module as index.html.
if (process.argv.includes("--geometry")) {
  const T = await import("../.tmp/three.module.mjs");
  function viewer(Class) {
    const v=Object.create(Class.prototype);
    Object.assign(v,{THREE:T,root:new T.Group(),resources:new Set(),hasFrame:true,foldAmount:0});
    v.label=()=>null;
    return v;
  }
  const bounds=(v)=> { v.root.updateMatrixWorld(true); return new T.Box3().setFromObject(v.root).getSize(new T.Vector3()); };
  for (const fold of presets.folds) for (const axis of ["vertical","horizontal"]) {
    const v=viewer(Leaflet3DViewer), panels=computePanels(sheet,fold,axis,2);
    v.build({panels,foldId:fold.id,foldAxis:axis,panelImages:{}});
    const open=bounds(v);
    assert(Math.abs(open.x-sheet.widthMm)<0.01,`${fold.id} ${axis} open width ${open.x}`);
    assert(Math.abs(open.y-sheet.heightMm)<0.01,`${fold.id} ${axis} open height ${open.y}`);
    for (const t of [0.25,0.5,0.75,1]) { v.applyFold(t); const b=bounds(v); assert([b.x,b.y,b.z].every(Number.isFinite)); }
    const finished=approxFinishedSize(sheet,fold,axis,panels), b=bounds(v);
    assert(b.x<=finished.widthMm+1,`${fold.id} ${axis} folded width ${b.x} expected ${finished.widthMm}`);
    assert(b.y<=finished.heightMm+1,`${fold.id} ${axis} folded height ${b.y} expected ${finished.heightMm}`);
    const center=new T.Box3().setFromObject(v.root).getCenter(new T.Vector3());
    for (const [i,sign] of [-1,1].entries()) {
      const ray=new T.Raycaster(new T.Vector3(center.x,center.y,sign*1000),new T.Vector3(0,0,-sign));
      const hit=ray.intersectObject(v.root,true)[0], cover=foldCovers(fold.id)[i];
      assert.equal(hit.object.name,`panel-${cover.index}`,`${fold.id} ${axis} cover panel`);
      assert.equal(hit.face.materialIndex,cover.side==="front"?4:5,`${fold.id} ${axis} cover side`);
    }
    v.clearRoot(); assert.equal(v.resources.size,0);
  }
  console.log("PASS: 7 folds × 2 axes, unfolded size, intermediate geometry, finished footprint, cleanup");
  for (const binding of BOOK_BINDINGS) {
    const v=viewer(Book3DViewer);
    v.build({width:148,height:210,binding,thickness:12,coverThickness:1.5,pages:Array(10).fill(null),open:0,turn:0.5});
    assert(v.root.getObjectByName("front-cover")); assert(v.root.getObjectByName("back-cover"));
    assert.equal(v.leaves.length,5);
    const closed=bounds(v);
    assert(closed.z<=25,`${binding} closed thickness ${closed.z}`);
    assert(v.leaves.every(({group,z})=>Math.abs(group.position.z-z)<1e-8),"closed pages must remain inside covers");
    for (const angle of [90,180,v.dimensions.maxOpen]) for (const turn of [0,0.5,1]) {
      v.setOpen(angle,turn); const b=bounds(v); assert([b.x,b.y,b.z].every(Number.isFinite));
      if (!v.dimensions.ring) assert(v.leaves.every(({group,z})=>Math.abs(group.position.z-z)<1e-8),"bound pages must remain attached to the spine while turning");
    }
    if (["wire","spiral"].includes(binding)) assert(v.root.getObjectByName("binding-ring"));
    if (!v.dimensions.ring) {
      for (const angle of [0,45,90,115,180]) {
        v.setOpen(angle,1);
        const normal=new T.Vector3(-Math.sin(angle*Math.PI/180),0,Math.cos(angle*Math.PI/180));
        let previous=Infinity;
        for (const {mesh,rest,z} of v.leaves) {
          const pos=mesh.geometry.attributes.position, depths=[];
          for(let j=0;j<pos.count;j++) {
            const x=rest[j*3]+mesh.position.x;
            if(x>100) depths.push(new T.Vector3(pos.getX(j)+mesh.position.x,pos.getY(j),pos.getZ(j)+z).dot(normal));
            if(Math.abs(x)<1e-5) assert(Math.abs(pos.getZ(j)-rest[j*3+2])<1e-5,"spine edge remains attached");
          }
          const lo=Math.min(...depths),hi=Math.max(...depths);
          assert(hi<previous-0.001,`${binding} ${angle}: page layers must stay separated`);
          previous=lo;
        }
      }
    }
    if(binding==="round_hardcover") assert(v.root.getObjectByName("round-spine"));
    v.clearRoot(); assert.equal(v.resources.size,0);
  }
  console.log("PASS: 6 bindings, complete covers, closed-page containment, opening and turning, cleanup");
  for (const count of [4,8,12,32]) {
    const b=viewer(Book3DViewer);
    b.build({brochure:true,width:148,height:210,binding:"saddle_stitch",paperThickness:0.12,coverThickness:0.25,pages:Array(count-2).fill(null),open:115,turn:0.5});
    assert.equal(b.leaves.length,count/2,"each physical leaf has two printed faces");
    for(const angle of [0,90,115,180]) for(const turn of [0,0.4,1]) {
      b.setOpen(angle,turn);
      assert([bounds(b).x,bounds(b).z].every(Number.isFinite));
      for(let i=0;i<b.leaves.length;i++) {
        const leaf=b.leaves[i], partner=b.leaves[b.leaves.length-1-i];
        assert.equal(leaf.hinge,partner.hinge,"paired sheet halves share a crease");
        const pos=leaf.mesh.geometry.attributes.position;
        for(let j=0;j<pos.count;j++) if(Math.abs(leaf.rest[3*j]+74)<1e-5) {
          assert(Math.hypot(pos.getX(j)+74,pos.getZ(j)-leaf.hinge)<=0.126,"centre fold stays joined within paper thickness");
        }
      }
    }
    b.clearRoot(); assert.equal(b.resources.size,0);
  }
  console.log("PASS: brochure paired folds, 4/8/12/32 pages, shared centre throughout turning");
  const z=viewer(Photozone3DViewer);
  const opts={width:4000,height:2500,depth:1200,section:290,printWidth:4000,printHeight:2500,mount:"cover",showPrint:true,braces:true,feet:true,weights:true,person:true,personHeight:1700};
  z.build(opts);
  for(const name of ["truss-chord","truss-diagonal","rear-brace","base-foot","ballast","person","photozone-print"]) assert(z.root.getObjectByName(name),name);
  assert(z.root.getObjectByName("rear-brace").position.z<0);
  z.build({...opts,showPrint:false,braces:false,feet:false,weights:false,person:false});
  for(const name of ["photozone-print","rear-brace","base-foot","ballast","person"]) assert.equal(z.root.getObjectByName(name),undefined);
  z.clearRoot(); assert.equal(z.resources.size,0);
  const p=viewer(Poster3DViewer); p.build({width:420,height:594});
  const pb=bounds(p); assert.equal(pb.x,420); assert.equal(pb.y,594); p.clearRoot();
  console.log("PASS: truss components and visibility switches, poster dimensions, resource cleanup");
}
