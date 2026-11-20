import {placeInMargin,reviewAnchor} from './review-layout.js';
// Repeat the artwork with white margins on continuation pages.
export function composeReviewPages(base,requests){
  const pages=[],W=Math.ceil(base.width/.6),H=Math.ceil(base.height+W*.3),pad=14;
  let font=Math.max(12,Math.min(20,W/60)),lineHeight=font*1.5,maxWidth;
  maxWidth=Math.min(W-2*pad,Math.max(180,Math.min(420,W*.38)));
  let width=maxWidth;
  const probe=document.createElement('canvas').getContext('2d');probe.font=`${font}px 'Malgun Gothic',sans-serif`;
  function wrap(text){const lines=[];for(const part of String(text).split('\n')){let row='';for(const ch of part){if(probe.measureText(row+ch).width>width-28){lines.push(row);row='';}row+=ch;}lines.push(row);}return lines;}
  let canvas,ctx,occupied=[];
  function newPage(){canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,W,H);ctx.drawImage(base,W*.2,W*.15);occupied=[];pages.push(canvas);}
  const place=(r,h)=>placeInMargin(r,width,h,W,H,occupied);
  newPage();
  for(const r of requests){
    font=(r.noteFont||14)*W/1440;lineHeight=font*1.5;probe.font=`${font}px 'Malgun Gothic',sans-serif`;
    maxWidth=Math.min(W*.2-26,r.noteWidth&&r.noteSpace==='board'?Math.max(100,r.noteWidth*W):W*.2-26);
    width=maxWidth;
    const lines=[];if(r.before)lines.push(...wrap('현재: '+r.before));if(r.after)lines.push(...wrap('변경: '+r.after));if(r.text)lines.push(...wrap(r.text));
    for(const c of r.comments||[])lines.push(...wrap(`댓글 · ${c.author}: ${c.text}`));
    if(!lines.length)lines.push('수정 내용을 입력해 주세요.');
    const chunks=[],limit=Math.max(1,Math.floor((Math.min(H-2*pad,H*.65)-60)/lineHeight));
    for(let i=0;i<lines.length;i+=limit)chunks.push({lines:lines.slice(i,i+limit)});
    for(const a of r.attachments||[])chunks.push({lines:wrap('교체·참고: '+a.name),image:a.image});
    for(let i=0;i<chunks.length;i++){
      const chunk=chunks[i];const imageH=chunk.image?Math.min(160,H*.25):0;
      const title=`${r.number}. ${r.resolved?'완료':'수정 요청'}${chunks.length>1?` (${i+1}/${chunks.length})`:''}`;
      probe.font=`bold ${font}px 'Malgun Gothic',sans-serif`;
      const titleWidth=probe.measureText(title).width;
      probe.font=`${font}px 'Malgun Gothic',sans-serif`;
      width=Math.min(maxWidth,Math.max(titleWidth,...chunk.lines.map(line=>probe.measureText(line).width),chunk.image?180:0)+28);
      if(r.noteWidth)width=maxWidth;
      const h=Math.min(H-2*pad,48+chunk.lines.length*lineHeight+(imageH?imageH+12:0));let b=place(r,h);
      if(!b){newPage();b=place(r,h);}
      const {x:tx,y:ty}=reviewAnchor(r,W,H),ex=Math.max(b.x,Math.min(b.x+b.w,tx)),ey=Math.max(b.y,Math.min(b.y+b.h,ty));
      ctx.strokeStyle=r.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(ex,ey);ctx.stroke();ctx.fillStyle=r.color;ctx.beginPath();ctx.arc(tx,ty,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=`rgba(255,254,245,${r.noteOpacity??1})`;ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.fillStyle=r.color;ctx.fillRect(b.x,b.y,5,b.h);
      ctx.font=`bold ${font}px 'Malgun Gothic',sans-serif`;ctx.fillText(`${r.number}. ${r.resolved?'완료':'수정 요청'}${chunks.length>1?` (${i+1}/${chunks.length})`:''}`,b.x+14,b.y+26);
      ctx.fillStyle='#203c2b';ctx.font=`${font}px 'Malgun Gothic',sans-serif`;let y=b.y+26+lineHeight;
      for(const line of chunk.lines){ctx.fillText(line,b.x+14,y);y+=lineHeight;}
      if(chunk.image){const iw=chunk.image.naturalWidth||chunk.image.width,ih=chunk.image.naturalHeight||chunk.image.height,scale=Math.min((width-28)/iw,imageH/ih);ctx.drawImage(chunk.image,b.x+14,y-8,iw*scale,ih*scale);}
      occupied.push(b);
    }
  }
  return pages;
}
