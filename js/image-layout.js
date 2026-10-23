export function layoutImage(iw,ih,w,h,fit='stretch') {
  if(fit==='stretch')return {x:0,y:0,w,h,ppi:Math.min(iw/w,ih/h)*25.4,crop:0};
  const scale=(fit==='cover'?Math.max:Math.min)(w/iw,h/ih),dw=iw*scale,dh=ih*scale;
  return {x:(w-dw)/2,y:(h-dh)/2,w:dw,h:dh,ppi:25.4/scale,crop:Math.max(0,1-(Math.min(w,dw)*Math.min(h,dh))/(dw*dh))};
}
export function fittedImage(image,w,h,fit='stretch',background='#ffffff') {
  if(!image||fit==='stretch')return image;
  const c=document.createElement('canvas'),scale=Math.min(2048/w,2048/h);c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext('2d'),r=layoutImage(image.naturalWidth||image.width,image.naturalHeight||image.height,c.width,c.height,fit);
  ctx.fillStyle=background;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,r.x,r.y,r.w,r.h);return c;
}
