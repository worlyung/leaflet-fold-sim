// Preview profiles, not vendor-certified caliper measurements.
export const PAPERS = {
  snow: {name:'스노우지', color:'#fffdf8', bulk:0.9, roughness:0.7},
  art: {name:'아트지', color:'#ffffff', bulk:0.8, roughness:0.4},
  uncoated: {name:'모조지', color:'#f7f3e8', bulk:1.2, roughness:0.95},
  textured: {name:'랑데뷰 계열', color:'#f5efdf', bulk:1.4, roughness:0.9},
  kraft: {name:'크라프트', color:'#bda078', bulk:1.3, roughness:1}
};
export const defaultSurface = () => ({paper:'snow', gsm:150, thickness:0.135, finish:'none', light:35, mask:null});
export function surfaceMaterial(viewer, image, surface) {
  const T=viewer.THREE, paper=PAPERS[surface.paper] || PAPERS.snow;
  if(!viewer.surfaceEnvironment){
    const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#30343a';ctx.fillRect(0,0,512,256);
    const shift=((surface.light+180)/360*512)%512;ctx.fillStyle='#ffffff';ctx.fillRect(shift,55,65,140);ctx.fillStyle='#9da8bb';ctx.fillRect((shift+230)%512,70,100,100);
    const env=viewer.texture(c);env.mapping=T.EquirectangularReflectionMapping;viewer.surfaceEnvironment=env;
  }
  const mat=viewer.own(new T.MeshPhysicalMaterial({color:paper.color, map:image?viewer.texture(image):null,
    envMap:viewer.surfaceEnvironment,envMapIntensity:0.7,
    roughness:surface.finish==='gloss'?0.16:surface.finish==='matte'?0.85:paper.roughness,
    metalness:0, clearcoat:surface.finish==='gloss'?1:0, clearcoatRoughness:0.08}));
  if(surface.finish==='epoxy' && surface.mask){
    const mask=viewer.texture(surface.mask); mask.colorSpace=T.NoColorSpace;
    mat.clearcoat=1; mat.clearcoatMap=mask; mat.bumpMap=mask; mat.bumpScale=0.1;
  } else if(['uncoated','textured','kraft'].includes(surface.paper)) {
    const pixels=new Uint8Array(64*64);for(let i=0;i<pixels.length;i++)pixels[i]=160+((i*71+i*i*13)%80);
    const grain=viewer.own(new T.DataTexture(pixels,64,64,T.RedFormat));grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(8,8);grain.needsUpdate=true;
    mat.bumpMap=grain;mat.bumpScale=surface.paper==='textured'?0.08:0.03;
  }
  return mat;
}
