export function reviewArtwork(W,H){return {x:W*.2,y:W*.15,w:W*.6,h:H-W*.3};}
export function reviewAnchor(r,W,H){const a=reviewArtwork(W,H);return {x:a.x+(r.x+r.x2)*a.w/2,y:a.y+(r.y+r.y2)*a.h/2};}
export function placeInMargin(r,w,h,W,H,occupied=[]){
  const a=reviewArtwork(W,H),t=reviewAnchor(r,W,H),gap=12,pad=8;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const overlap=(b,c)=>b.x<c.x+c.w+gap&&b.x+b.w+gap>c.x&&b.y<c.y+c.h+gap&&b.y+b.h+gap>c.y;
  const fits=b=>b.x>=0&&b.y>=0&&b.x+w<=W&&b.y+h<=H&&!overlap(b,a)&&!occupied.some(c=>overlap(b,c));
  if(r.noteSpace==='board'&&Number.isFinite(r.noteX)&&Number.isFinite(r.noteY)){
    const b={x:clamp(r.noteX*W,0,W-w),y:clamp(r.noteY*H,0,H-h),w,h};
    if(fits(b))return b;
  }
  const candidates=[];
  for(const x of [a.x-w-gap,a.x+a.w+gap])for(const y of [clamp(t.y-h/2,pad,H-h-pad),...occupied.flatMap(b=>[b.y+b.h+gap,b.y-h-gap]),...Array.from({length:Math.ceil(H/20)},(_,i)=>i*20)])candidates.push({x,y,w,h});
  for(const y of [a.y-h-gap,a.y+a.h+gap])for(const x of [clamp(t.x-w/2,pad,W-w-pad),...Array.from({length:Math.ceil(W/20)},(_,i)=>i*20)])candidates.push({x,y,w,h});
  const score=b=>Math.hypot(t.x-clamp(t.x,b.x,b.x+w),t.y-clamp(t.y,b.y,b.y+h))+.05*Math.hypot(t.x-b.x-w/2,t.y-b.y-h/2);
  return candidates.filter(fits).sort((b,c)=>score(b)-score(c))[0];
}
