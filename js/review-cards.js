import {placeInMargin,reviewAnchor} from './review-layout.js';
// Request cards occupy the white margins around the artwork.
export function createReviewCards({sheet,getRows,getSurface,getSelected,isVisible,isSelecting,choose,save}){
  const layer=document.createElement('div');layer.id='reviewCards';sheet.append(layer);
  let dragging=false;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function render(){
    if(dragging)return;
    layer.replaceChildren();layer.hidden=!isVisible();
    if(layer.hidden)return;
    const W=sheet.clientWidth,H=sheet.clientHeight,occupied=[];
    if(!W||!H)return;
    const editor=sheet.querySelector('#reviewInline');
    if(editor&&!editor.hidden)occupied.push({x:parseFloat(editor.style.left)||0,y:parseFloat(editor.style.top)||0,w:editor.offsetWidth,h:editor.offsetHeight});
    const ns='http://www.w3.org/2000/svg',links=document.createElementNS(ns,'svg');links.setAttribute('width',W);links.setAttribute('height',H);links.style.cssText='position:absolute;inset:0;pointer-events:none';layer.append(links);
    const active=getRows().find(r=>r.id===getSelected());
    if(active&&editor&&!editor.hidden){const t=reviewAnchor(active,W,H),line=document.createElementNS(ns,'line'),x=parseFloat(editor.style.left),y=parseFloat(editor.style.top);for(const [key,value]of Object.entries({x1:t.x,y1:t.y,x2:clamp(t.x,x,x+editor.offsetWidth),y2:clamp(t.y,y,y+editor.offsetHeight),stroke:active.color,'stroke-width':1.5}))line.setAttribute(key,value);links.append(line);}
    const probe=document.createElement('canvas').getContext('2d');
    for(const [i,r] of getRows().entries()){
      if(r.surface!==getSurface()?.key||r.id===getSelected())continue;
      const card=document.createElement('section');card.className='review-card';card.dataset.id=r.id;
      const title=document.createElement('button');title.type='button';title.className='review-card-title';title.textContent=`${i+1}. ${r.resolved?'완료':'수정 요청'}`;title.title='클릭해서 편집 · 드래그해서 이동';
      const body=document.createElement('button');body.type='button';body.className='review-card-body';
      body.textContent=[r.before&&`현재: ${r.before}`,r.after&&`변경: ${r.after}`,r.text].filter(Boolean).join('\n')||'눌러서 수정 내용 입력';
      const font=r.noteFont||14;probe.font=`${font}px 'Malgun Gothic',sans-serif`;
      const autoWidth=Math.min(300,Math.max(130,...body.textContent.split('\n').map(s=>probe.measureText(s).width+24)));
      const width=clamp(r.noteWidth&&r.noteSpace==='board'?r.noteWidth*W:autoWidth,100,W*.2-26);
      card.style.cssText=`width:${width}px;font-size:${font}px;border-color:${r.color};background:rgba(255,254,245,${r.noteOpacity??1});pointer-events:${isSelecting()?'auto':'none'}`;
      card.style.maxHeight=Math.max(100,H*.65)+'px';card.style.overflow='auto';
      const resize=document.createElement('button');resize.type='button';resize.className='review-card-resize';resize.title='드래그해서 박스 너비 조절';resize.setAttribute('aria-label','박스 너비 조절');resize.textContent='◢';
      card.append(title,body,resize);layer.append(card);
      const placed=placeInMargin(r,width,card.offsetHeight,W,H,occupied)||placeInMargin(r,width,card.offsetHeight,W,H)||{x:8,y:8};
      const {x,y}=placed;
      card.style.left=x+'px';card.style.top=y+'px';occupied.push({x,y,w:width,h:card.offsetHeight});
      const anchor=reviewAnchor(r,W,H),link=document.createElementNS(ns,'line'),tx=anchor.x,ty=anchor.y;
      for(const [key,value] of Object.entries({x1:tx,y1:ty,x2:clamp(tx,x,x+width),y2:clamp(ty,y,y+card.offsetHeight),stroke:r.color,'stroke-width':1.5}))link.setAttribute(key,value);links.append(link);
      const edit=()=>choose(r.id);
      body.onclick=edit;
      function start(e,sizing){
        if(e.button!==0)return;e.preventDefault();e.stopPropagation();dragging=true;
        const sx=e.clientX,sy=e.clientY,left=parseFloat(card.style.left),top=parseFloat(card.style.top),startWidth=card.offsetWidth;
        let moved=false;const handle=e.currentTarget;handle.setPointerCapture(e.pointerId);
        handle.onpointermove=ev=>{moved=moved||Math.hypot(ev.clientX-sx,ev.clientY-sy)>3;if(sizing)card.style.width=clamp(startWidth+ev.clientX-sx,100,W*.2-26)+'px';else{card.style.left=clamp(left+ev.clientX-sx,0,W-card.offsetWidth)+'px';card.style.top=clamp(top+ev.clientY-sy,0,Math.max(0,H-card.offsetHeight))+'px';}};
        handle.onpointerup=()=>{dragging=false;handle.onpointermove=null;handle.onpointerup=null;if(moved||sizing)save(r.id,{noteSpace:'board',noteX:parseFloat(card.style.left)/W,noteY:parseFloat(card.style.top)/H,...(sizing?{noteWidth:card.offsetWidth/W}:{})});else edit();};
        handle.onpointercancel=()=>{dragging=false;handle.onpointermove=null;render();};
      }
      title.onpointerdown=e=>start(e,false);title.onclick=e=>e.preventDefault();resize.onpointerdown=e=>start(e,true);
    }
  }
  return {render};
}
