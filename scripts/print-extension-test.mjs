import assert from 'node:assert/strict';
import * as T from '../.tmp/three.module.mjs';
import {Poster3DViewer} from '../js/poster-3d.js';
import {layoutImage} from '../js/image-layout.js';
const create=()=>{const v=Object.create(Poster3DViewer.prototype);Object.assign(v,{THREE:T,root:new T.Group(),resources:new Set(),hasFrame:true});v.label=()=>null;return v;};
for(const lampMount of ['top','both']){
 const v=create();v.build({kind:'lamp',width:600,height:1800,lampMount,wind:80});assert.equal(v.cloths.length,2);
 assert.equal(v.root.children.filter(c=>c.name==='lamp-banner-arm').length,lampMount==='top'?1:2);
 v.updateAnimation(1);let moved=false;
 for(const {mesh,base}of v.cloths){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const delta=Math.abs(a.getZ(i)-base[i*3+2]);if(base[i*3+1]===900||(lampMount==='both'&&base[i*3+1]===-900))assert(delta<0.001,'fixed edge must stay fixed');else if(delta>1)moved=true;}}
 assert(moved);const before=v.cloths[0].mesh.geometry.attributes.position.array.slice();v.updateAnimation(2);assert.notDeepEqual(v.cloths[0].mesh.geometry.attributes.position.array,before);
 v.clearRoot();assert.equal(v.resources.size,0);
}
const still=create();still.build({kind:'lamp',width:600,height:1800,wind:0});still.updateAnimation(2);assert.deepEqual(still.cloths[0].mesh.geometry.attributes.position.array,still.cloths[0].base);
assert(Math.abs(layoutImage(600,600,600,1800,'cover').crop-2/3)<1e-6);
assert.equal(layoutImage(600,600,600,1800,'contain').ppi,25.4);
assert(Math.abs(layoutImage(600,600,600,1800,'cover').ppi-25.4/3)<1e-6);
console.log('PASS dual lamp cloth, fixed top/both edges, wind animation/stop, resource disposal, crop and final-size PPI');
