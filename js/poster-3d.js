import { SceneViewer } from "./scene-viewer.js";
import { fittedImage } from './image-layout.js';
export class Poster3DViewer extends SceneViewer {
  build(o) {
    this.clearRoot();
    this.cloths=[];this.updateAnimation=null;
    const kind=o.kind || 'poster', banner=kind==='banner', fabric=kind==='fabric', lamp=kind==='lamp';
    if(banner || fabric || lamp) this.surface=null; else this.surface=undefined;
    const main=this.sheet(o.width, o.height, banner?0.5:fabric?1:(SceneViewer.printSurface?.thickness || 0.3),
      fittedImage(o.front,o.width,o.height,o.fit,o.fitColor) || this.label(lamp?'가로등 현수기':banner?'배너':fabric?'현수막':"포스터", "#af6747", `${o.width} × ${o.height} mm`), fittedImage(o.back,o.width,o.height,o.fit,o.fitColor),
      this.root, "poster", o.backColor);
    const metal=this.material(0x444c55);
    if(lamp){
      const x=-o.width/2-120,bottom=-o.height/2-1800,top=o.height/2+1100;
      const left=this.sheet(o.width,o.height,1,fittedImage(o.leftFront,o.width,o.height,o.fit,o.fitColor)||this.label('왼쪽 현수기'),fittedImage(o.leftBack,o.width,o.height,o.fit,o.fitColor),this.root,'lamp-left',o.backColor);
      left.position.x=2*x;
      this.rod([x,bottom,-30],[x,top,-30],55,metal,this.root,'lamp-pole');
      for(const y of o.lampMount==='both'?[-o.height/2,o.height/2]:[o.height/2])this.rod([2*x-o.width/2-25,y,0],[o.width/2+25,y,0],14,metal,this.root,'lamp-banner-arm');
      this.rod([x,top,-30],[x+700,top+150,-30],30,metal);
      this.box(400,80,160,this.material(0xaaaaa0),this.root,'lamp-head').position.set(x+700,top+150,-30);
      for(const mesh of [main,left]){mesh.geometry=this.own(new this.THREE.BoxGeometry(o.width,o.height,1,12,28,1));this.cloths.push({mesh,base:mesh.geometry.attributes.position.array.slice()});}
      this.updateAnimation=t=>{const strength=(o.wind??25)/100;for(const [index,{mesh,base}]of this.cloths.entries()){
        const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=base[i*3],y=base[i*3+1],f=(o.height/2-y)/o.height;
          const envelope=o.lampMount==='both'?Math.sin(Math.PI*f):f*f;
          a.setXYZ(i,x,y,base[i*3+2]+strength*Math.min(o.width*0.35,o.height*0.12)*envelope*Math.sin(t*2.3+f*5+x/o.width*3+index*0.6));
        }a.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}
      };
    }
    if(banner){
      for(const sign of [-1,1]) this.rod([-o.width/2,sign*o.height/2,-20],[o.width/2,-sign*o.height/2,-20],8,metal);
      this.box(o.width*0.7,o.stand==='water'?150:30,500,metal,this.root,'banner-base').position.set(0,-o.height/2-80,-130);
      this.rod([0,-o.height/2-80,-130],[0,0,-20],12,metal);
    }
    if(fabric){
      if(o.finish==='pole') for(const y of [-o.height/2,o.height/2]) this.rod([-o.width/2-30,y,0],[o.width/2+30,y,0],12,metal);
      else for(const x of [-o.width/2+25,o.width/2-25]) for(const y of [-o.height/2+25,o.height/2-25]){
        const ring=new this.THREE.Mesh(this.own(new this.THREE.TorusGeometry(10,3,8,20)),metal); ring.position.set(x,y,3); this.root.add(ring);
      }
    }
    this.finishBuild();
  }
}
