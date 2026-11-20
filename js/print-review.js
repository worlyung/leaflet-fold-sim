import {downloadCanvasPng,downloadCanvasesPdf} from './export-flat.js';
import {composeReviewPages} from './review-export.js';
import {createReviewCards} from './review-cards.js';
import {placeInMargin} from './review-layout.js';

const TYPES={box:'박스',circle:'동그라미',underline:'밑줄',arrow:'화살표',pin:'핀'};
const clamp=n=>Math.max(0,Math.min(1,n));
export function validatePrintReview(rows){
  if(rows===undefined)return;
  if(!Array.isArray(rows)||rows.length>1000)throw Error('수정 표시 목록이 올바르지 않아요.');
  const ids=new Set();
  for(const r of rows){
    if(!r||typeof r.id!=='string'||ids.has(r.id)||!TYPES[r.type]||typeof r.surface!=='string'||typeof r.label!=='string')throw Error('수정 표시 형식 오류');ids.add(r.id);
    if(!['x','y','x2','y2'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1)||!/^#[0-9a-f]{6}$/i.test(r.color)||![2,4,6].includes(r.line))throw Error('수정 표시 위치·색상 오류');
    for(const key of ['noteX','noteY'])if(r[key]!==undefined&&(!Number.isFinite(r[key])||r[key]<0||r[key]>1))throw Error('설명 박스 위치 오류');
    for(const [key,min,max] of [['noteFont',10,32],['noteOpacity',.15,1],['noteWidth',.01,1]])if(r[key]!==undefined&&(!Number.isFinite(r[key])||r[key]<min||r[key]>max))throw Error('설명 박스 스타일 오류');
    for(const k of ['text','before','after','author','category'])if(typeof r[k]!=='string'||r[k].length>2000)throw Error('수정 요청 내용 오류');
    if(!Array.isArray(r.comments)||r.comments.length>500||r.comments.some(c=>!c||typeof c.text!=='string'||c.text.length>2000||typeof c.author!=='string'||typeof c.at!=='string'))throw Error('댓글 형식 오류');
    if(!Array.isArray(r.attachments)||r.attachments.length>4||r.attachments.some(a=>typeof a.name!=='string'||!(a.image instanceof HTMLImageElement)))throw Error('교체 이미지 형식 오류');
  }
}

export function initPrintReview({state,getSurfaces,loadImageFile,showBanner:notify}){
  state.printReview=[];
  const launch=document.createElement('button');launch.id='printReviewOpen';launch.textContent='수정 요청 표시';launch.type='button';document.querySelector('.topbar-meta').prepend(launch);
  const modal=document.createElement('dialog');modal.id='printReview';
  modal.innerHTML=`<header><div><strong>인쇄물 수정 요청</strong><small>정면으로 펼쳐 위치를 표시해요 · 원본 이미지는 바뀌지 않아요</small></div><button id="reviewClose">닫기</button></header>
  <div class="review-toolbar"><label>면·페이지 <select id="reviewSurface"></select></label><div id="reviewTools" aria-label="표시 도구"><button data-tool="select">선택·이동</button>${Object.entries(TYPES).map(([k,v])=>`<button data-tool="${k}">${v}</button>`).join('')}</div><label>색 <input id="reviewColor" type="color" value="#d93c35"></label><label>굵기 <select id="reviewLine"><option value="2">얇게</option><option value="4" selected>보통</option><option value="6">굵게</option></select></label><label><input id="reviewVisible" type="checkbox" checked>표시 보기</label><button id="reviewUndo">되돌리기</button><button id="reviewRedo">다시 실행</button></div>
  <div class="review-layout"><div class="review-stage"><div id="reviewSheet"><canvas id="reviewImage"></canvas><svg id="reviewMarks" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="수정 위치 표시"></svg></div><p id="reviewHelp">도구를 고른 뒤 종이 위를 드래그하세요. 핀은 클릭해서 놓아요.</p></div>
  <aside><label>작성 이름 <input id="reviewAuthor" maxlength="40" placeholder="이름"></label><div id="reviewList" aria-label="수정 요청 목록"></div>
  <div id="reviewEmpty">표시를 그리거나 목록에서 선택하세요.</div><section id="reviewEditor" hidden><h3 id="reviewTitle"></h3><label>수정 종류 <select id="reviewCategory"><option>문구 수정</option><option>사진 교체</option><option>위치·크기</option><option>색상</option><option>기타</option></select></label><label>현재 문구 <textarea id="reviewBefore" maxlength="2000" rows="2"></textarea></label><label>바꿀 문구 <textarea id="reviewAfter" maxlength="2000" rows="2"></textarea></label><label>수정 요청 <textarea id="reviewText" maxlength="2000" rows="3" placeholder="어떻게 바꾸면 될까요?"></textarea></label><label>교체·참고 사진 <input id="reviewAttachment" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><small>최대 4장, 한 장당 10MB · 전달용 참고자료</small><div id="reviewAttachments"></div><button id="reviewDone">수정 완료</button><button id="reviewDelete">표시 삭제</button><h4>댓글</h4><div id="reviewComments"></div><textarea id="reviewReply" rows="2" maxlength="2000" placeholder="댓글 · Ctrl+Enter로 등록"></textarea><button id="reviewReplyAdd">댓글 등록</button></section></aside></div>
  <footer><span>요청·댓글·첨부는 ‘작업 전체 저장’ 파일에 포함됩니다. 실시간 공동편집은 아니에요.</span><button id="reviewPng">현재 면 표시 PNG</button><button id="reviewPdf">수정 요청 PDF</button><button id="reviewSave">작업 전체 저장</button></footer>`;
  document.body.append(modal);
  const style=document.createElement('style');style.textContent=`
  #printReview{width:min(1480px,96vw);height:94vh;max-width:96vw;max-height:94vh;box-sizing:border-box;padding:0;border:1px solid #82968b;border-radius:16px;background:#f6f7f3;color:#213a30;font:14px/1.5 'Malgun Gothic',sans-serif}
  #printReview[open]{display:flex;flex-direction:column}#printReview::backdrop{background:#10261fd0}#printReview header,#printReview footer{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:14px 20px;background:#fff;flex:none}#printReview header{border-bottom:1px solid #d6ded7}#printReview header small{display:block;color:#66786f}#printReview footer{border-top:1px solid #d6ded7;flex-wrap:wrap}#printReview footer span{flex:1;min-width:200px;font-size:12px}
  #printReview button,#printReview select,#printReview input,#printReview textarea{font:inherit;color:inherit;border:1px solid #b7c4bb;border-radius:7px;background:white;box-sizing:border-box;padding:7px 9px}#printReview button{cursor:pointer}#printReview button:focus-visible{outline:3px solid #d29d45}#printReview button[aria-pressed=true],#reviewList button.selected{background:#234c3c;color:#fff}#printReview input[type=color]{width:40px;padding:2px}#printReview input[type=checkbox]{width:auto}
  .review-toolbar{display:flex;gap:10px;align-items:center;padding:12px 20px;flex-wrap:wrap}.review-toolbar label{display:flex;gap:6px;align-items:center}#reviewTools{display:flex;gap:4px;flex-wrap:wrap}.review-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;min-height:0;flex:1}.review-stage{overflow:auto;padding:24px;background:#e4e9e4;min-width:0}#reviewSheet{position:relative;margin:0 auto;width:100%;max-width:900px;box-shadow:0 4px 20px #0002;background:white}#reviewImage{display:block;width:100%;height:auto}#reviewMarks{position:absolute;inset:0;width:100%;height:100%;touch-action:none}#reviewHelp{color:#52645b;font-size:12px}.review-layout aside{overflow:auto;padding:16px;border-left:1px solid #d2dcd3}.review-layout aside label{display:block;margin-bottom:10px}.review-layout aside input,.review-layout aside textarea,.review-layout aside select{display:block;width:100%;margin-top:4px}.review-layout aside h3{font-size:14px}#reviewList{max-height:180px;overflow:auto;margin:12px 0;display:grid;gap:5px}#reviewList button{text-align:left;white-space:normal;overflow-wrap:anywhere}#reviewAttachments{display:flex;gap:6px;flex-wrap:wrap}#reviewAttachments img{width:70px;height:70px;object-fit:contain}#reviewAttachments figure{margin:0;width:80px;overflow-wrap:anywhere;font-size:10px}#reviewComments article{padding:8px 0;border-top:1px solid #dae0d9;white-space:pre-wrap;overflow-wrap:anywhere}#printReview [hidden]{display:none!important}#reviewPng,#reviewPdf{white-space:nowrap}
  @media(max-width:800px){.review-layout{grid-template-columns:minmax(0,1fr) 240px}.review-toolbar{padding:8px;gap:5px}#printReview{width:98vw;max-width:98vw}.review-stage{padding:10px}#printReview header,#printReview footer{padding:10px}}
  `;document.head.append(style);
  style.textContent+='.review-toolbar>label{white-space:nowrap;flex-shrink:0}.review-toolbar select{max-width:240px}#reviewTools{flex-shrink:0}';
  const $=id=>modal.querySelector('#'+id),svg=$('reviewMarks');
  const artwork=document.createElement('div');artwork.id='reviewArtwork';$('reviewSheet').prepend(artwork);artwork.append($('reviewImage'),svg);
  style.textContent+='#reviewSheet{max-width:1440px;min-width:1000px;padding:15% 20%;box-sizing:border-box}#reviewArtwork{position:relative}#reviewInline{max-height:70vh;overflow:auto}';
  const inline=document.createElement('section');inline.id='reviewInline';inline.hidden=true;
  const inlineTitle=document.createElement('strong');inlineTitle.textContent='수정 요청';
  const textLabel=$('reviewText').parentElement;
  const finish=document.createElement('button');finish.type='button';finish.textContent='입력 완료';
  inline.append(inlineTitle,textLabel,finish);$('reviewSheet').append(inline);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='문구 교체 · 사진 · 댓글';
  $('reviewEditor').before(details);details.append(summary,$('reviewEditor'));
  inline.append(details);
  modal.querySelector('.review-toolbar').append($('reviewAuthor').parentElement);
  modal.querySelector('aside').hidden=true;
  const appearance=document.createElement('div');appearance.className='review-appearance';
  appearance.innerHTML='<label>글씨 <select id="reviewFont">'+[10,12,14,16,18,20,24,28,32].map(n=>`<option value="${n}">${n}px</option>`).join('')+'</select></label><label>배경 <input id="reviewOpacity" type="range" min="15" max="100" step="5" value="100" aria-label="박스 배경 불투명도"><output id="reviewOpacityValue">100%</output></label><button type="button" id="reviewAutoWidth">글에 맞춤</button>';
  inline.insertBefore(appearance,finish);
  const inlineResize=document.createElement('button');inlineResize.className='review-card-resize';inlineResize.type='button';inlineResize.textContent='◢';inlineResize.setAttribute('aria-label','입력 박스 너비 조절');inline.append(inlineResize);
  style.textContent+=`.review-layout{display:block!important}.review-stage{height:100%;box-sizing:border-box}#reviewAuthor{width:100px}#reviewCards{position:absolute;inset:0;pointer-events:none}.review-card{position:absolute;box-sizing:border-box;min-width:100px;border:1px solid;border-left:4px solid;border-radius:6px;padding:6px 10px 14px;z-index:2;box-shadow:0 2px 5px #0001;overflow-wrap:anywhere}#printReview .review-card-title,#printReview .review-card-body{display:block;width:100%;text-align:left;background:transparent;border:0;padding:0;white-space:pre-wrap;border-radius:0}#printReview .review-card-title{font-size:12px;font-weight:bold;cursor:move;touch-action:none;margin-bottom:3px}#printReview .review-card-body{font-size:inherit;line-height:1.45}#printReview .review-card-resize{position:absolute;bottom:0;right:0;padding:0 3px;border:0;background:transparent;cursor:ew-resize;touch-action:none;font-size:14px}#reviewInline details{font-size:12px;max-height:240px;overflow:auto;margin-top:8px}#reviewInline details label{font-size:12px!important;margin-top:6px}#reviewInline details input,#reviewInline details select{max-width:100%;width:100%}#reviewInline .review-appearance{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0}#reviewInline .review-appearance label{display:flex;font-size:11px;gap:4px;align-items:center}#reviewInline .review-appearance select{padding:2px}#reviewInline .review-appearance input{width:65px;padding:0}#reviewInline details summary{cursor:pointer}`;
  style.textContent+=`#reviewInline{position:absolute;z-index:3;background:#fffef5;border:1px solid #d93c35;border-left:4px solid #d93c35;border-radius:8px;padding:8px;box-shadow:0 3px 12px #0002;box-sizing:border-box;max-width:100%}#reviewInline strong{font-size:12px}#reviewInline label{display:block;font-size:0}#reviewInline textarea{display:block;width:100%;resize:none;font-size:14px;line-height:21px;min-height:48px;max-height:180px;margin:4px 0;background:transparent;border:0;padding:4px}#reviewInline button{font-size:12px;padding:3px 8px}#printReview aside details summary{cursor:pointer;padding:10px 0}`;
  function positionInline(){
    const r=current();inline.hidden=!r||!visible||tool!=='select';if(inline.hidden)return;
    const sheet=$('reviewSheet'),w=sheet.clientWidth,h=sheet.clientHeight;
    const text=$('reviewText'),probe=document.createElement('canvas').getContext('2d');probe.font="14px 'Malgun Gothic',sans-serif";
    inline.style.width=Math.min(w,Math.max(160,Math.min(300,...(text.value||'어떻게 바꾸면 될까요?').split('\n').map(s=>probe.measureText(s).width+36))))+'px';
    inline.style.width=Math.min(w*.2-26,Math.max(160,r.noteWidth&&r.noteSpace==='board'?r.noteWidth*w:240))+'px';
    text.style.fontSize=(r.noteFont||14)+'px';text.style.lineHeight='1.5';inline.style.background=`rgba(255,254,245,${r.noteOpacity??1})`;inline.style.borderColor=r.color;
    $('reviewFont').value=String(r.noteFont||14);$('reviewOpacity').value=String(Math.round((r.noteOpacity??1)*100));$('reviewOpacityValue').textContent=$('reviewOpacity').value+'%';
    text.style.height='48px';text.style.height=Math.min(180,text.scrollHeight)+'px';
    const bw=inline.offsetWidth,bh=inline.offsetHeight;
    const b=placeInMargin(r,bw,bh,w,h)||{x:8,y:Math.max(8,h-bh-8)};let {x,y}=b;
    inline.style.left=Math.max(0,Math.min(w-bw,x))+'px';inline.style.top=Math.max(0,Math.min(h-bh,y))+'px';inlineTitle.textContent=`${rows().indexOf(r)+1}. 수정 요청 · 드래그로 이동`;
  }
  inlineTitle.style.cssText='display:block;cursor:move;touch-action:none;user-select:none';
  style.textContent+='#reviewInline .review-appearance label{white-space:nowrap;flex-shrink:0}#reviewInline .review-appearance select{width:auto}#reviewInline details[open]{min-width:0}';
  let noteDrag=null;
  inlineTitle.onpointerdown=e=>{if(e.button!==0)return;$('reviewText').blur();noteDrag={x:e.clientX,y:e.clientY,left:parseFloat(inline.style.left),top:parseFloat(inline.style.top)};inlineTitle.setPointerCapture(e.pointerId);e.preventDefault();};
  inlineTitle.onpointermove=e=>{if(!noteDrag)return;const sheet=$('reviewSheet');inline.style.left=Math.max(0,Math.min(sheet.clientWidth-inline.offsetWidth,noteDrag.left+e.clientX-noteDrag.x))+'px';inline.style.top=Math.max(0,Math.min(sheet.clientHeight-inline.offsetHeight,noteDrag.top+e.clientY-noteDrag.y))+'px';};
  inlineTitle.onpointerup=()=>{if(!noteDrag)return;noteDrag=null;update({noteX:clamp(parseFloat(inline.style.left)/$('reviewSheet').clientWidth),noteY:clamp(parseFloat(inline.style.top)/$('reviewSheet').clientHeight)});};
  inlineTitle.onpointercancel=()=>{noteDrag=null;positionInline();};
  inlineResize.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();$('reviewText').blur();const start=e.clientX,width=inline.offsetWidth;inlineResize.setPointerCapture(e.pointerId);inlineResize.onpointermove=ev=>{inline.style.width=Math.max(160,Math.min($('reviewSheet').clientWidth-parseFloat(inline.style.left),width+ev.clientX-start))+'px';};inlineResize.onpointerup=()=>{inlineResize.onpointermove=null;update({noteWidth:inline.offsetWidth/$('reviewSheet').clientWidth});};inlineResize.onpointercancel=()=>{inlineResize.onpointermove=null;positionInline();};};
  $('reviewFont').onchange=()=>update({noteFont:Number($('reviewFont').value)});
  $('reviewOpacity').oninput=()=>{inline.style.background=`rgba(255,254,245,${Number($('reviewOpacity').value)/100})`;$('reviewOpacityValue').textContent=$('reviewOpacity').value+'%';};
  $('reviewOpacity').onchange=()=>update({noteOpacity:Number($('reviewOpacity').value)/100});
  $('reviewAutoWidth').onclick=()=>update({noteWidth:undefined});
  finish.onclick=()=>{$('reviewText').blur();choose(null);};
  $('reviewText').oninput=positionInline;
  new ResizeObserver(()=>{const s=$('reviewSheet'),w=s.clientWidth;s.style.padding=`${w*.15}px ${w*.2}px`;positionInline();cards.render();}).observe($('reviewSheet'));
  function showBanner(message,error){$('reviewHelp').textContent=message;$('reviewHelp').style.color=error?'#a52f2f':'#52645b';$('reviewHelp').setAttribute('role','status');notify(message,error);}
  let surfaces=[],surface=null,selected=null,tool='box',gesture=null,history=[],future=[],visible=true;
  const rows=()=>state.printReview||[];
  const current=()=>rows().find(r=>r.id===selected);
  const cards=createReviewCards({sheet:$('reviewSheet'),getRows:rows,getSurface:()=>surface,getSelected:()=>tool==='select'?selected:null,isVisible:()=>visible,isSelecting:()=>tool==='select',choose,save:(id,patch,undo=true)=>{const next=rows().map(r=>r.id===id?{...r,...patch}:r);if(undo)commit(next);else state.printReview=next;}});
  function commit(next){history.push(rows());if(history.length>60)history.shift();future=[];state.printReview=next;draw();list();}
  function update(patch){const r=current();if('noteX' in patch||'noteWidth' in patch)patch.noteSpace='board';if(r)commit(rows().map(x=>x.id===r.id?{...x,...patch}:x));}
  function setTool(value){tool=value;for(const b of $('reviewTools').children)b.setAttribute('aria-pressed',String(b.dataset.tool===tool));svg.style.cursor=value==='select'?'default':'crosshair';positionInline();cards.render();}
  $('reviewTools').onclick=e=>{if(e.target.dataset.tool)setTool(e.target.dataset.tool);};
  function list(){const list=$('reviewList');list.replaceChildren();rows().forEach((r,i)=>{const b=document.createElement('button');b.textContent=`${r.resolved?'✓':'○'} ${i+1}. ${r.label} · ${r.text||r.after||TYPES[r.type]}`;b.classList.toggle('selected',r.id===selected);b.onclick=()=>{const s=surfaces.find(s=>s.key===r.surface);if(!s){showBanner('현재 제품·규격에 없는 표시예요. 원래 제품·규격으로 돌아가 주세요.',true);return;}surface=s;$('reviewSurface').value=s.key;paint();choose(r.id);[...svg.children].find(g=>g.getAttribute('data-id')===r.id)?.scrollIntoView({block:'center',inline:'center'});};list.append(b);});$('reviewUndo').disabled=!history.length;$('reviewRedo').disabled=!future.length;}
  function choose(id){selected=id;const r=current();$('reviewEditor').hidden=!r;$('reviewEmpty').hidden=!!r;if(r){$('reviewTitle').textContent=`${rows().indexOf(r)+1}. ${r.label}`;for(const [field,key]of [['reviewText','text'],['reviewBefore','before'],['reviewAfter','after'],['reviewCategory','category'],['reviewColor','color'],['reviewLine','line']])$(field).value=r[key];setTool('select');$('reviewDone').textContent=r.resolved?'다시 열기':'수정 완료';$('reviewReply').value='';threads();attachments();}draw();list();}
  function threads(){const r=current();$('reviewComments').replaceChildren();for(const c of r?.comments||[]){const a=document.createElement('article');a.textContent=`${c.author} · ${new Date(c.at).toLocaleString('ko-KR')}\n${c.text}`;$('reviewComments').append(a);}}
  function attachments(){const host=$('reviewAttachments');host.replaceChildren();for(const [i,a]of (current()?.attachments||[]).entries()){const f=document.createElement('figure'),img=document.createElement('img'),b=document.createElement('button');img.src=a.image.src;img.alt=a.name;b.textContent='제거';b.onclick=()=>{update({attachments:current().attachments.filter((_,j)=>j!==i)});attachments();};f.append(img,document.createTextNode(a.name),b);host.append(f);}}
  function paint(){const c=surface.preview||(surface.preview=surface.canvas()),target=$('reviewImage');target.width=c.width;target.height=c.height;target.getContext('2d').drawImage(c,0,0);draw();}
  const node=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
  function draw(){svg.replaceChildren();positionInline();cards.render();if(!surface||!visible)return;const c=surface.preview||(surface.preview=surface.canvas());svg.setAttribute('viewBox',`0 0 ${c.width} ${c.height}`);const entries=rows().filter(r=>r.surface===surface.key);if(gesture?.draft)entries.push(gesture.draft);
    for(const r of entries){const x=r.x*c.width,y=r.y*c.height,x2=r.x2*c.width,y2=r.y2*c.height,g=node('g',{'data-id':r.id,opacity:r.resolved?.55:1}),attrs={stroke:r.color,'stroke-width':r.line,fill:'none','vector-effect':'non-scaling-stroke','pointer-events':'all'};let shape;
      if(r.type==='box')shape=node('rect',{...attrs,x:Math.min(x,x2),y:Math.min(y,y2),width:Math.abs(x2-x),height:Math.abs(y2-y)});
      else if(r.type==='circle')shape=node('ellipse',{...attrs,cx:(x+x2)/2,cy:(y+y2)/2,rx:Math.abs(x2-x)/2,ry:Math.abs(y2-y)/2});
      else if(r.type==='pin')shape=node('circle',{...attrs,cx:x,cy:y,r:13,fill:r.color});
      else {shape=node('path',{...attrs,d:`M${x} ${y} L${x2} ${y2}`});if(r.type==='arrow'){const a=Math.atan2(y2-y,x2-x),len=20;g.append(node('path',{...attrs,d:`M${x2-len*Math.cos(a-.5)} ${y2-len*Math.sin(a-.5)} L${x2} ${y2} L${x2-len*Math.cos(a+.5)} ${y2-len*Math.sin(a+.5)}`}));}}
      g.append(shape);const label=node('text',{x:x+16,y:y-8,fill:r.color,'font-size':25,'font-weight':'bold','paint-order':'stroke',stroke:'white','stroke-width':3});label.textContent=rows().indexOf(r)+1||rows().length+1;g.append(label);
      if(r.id===selected&&r.type!=='pin')g.append(node('circle',{cx:x2,cy:y2,r:10,fill:'white',stroke:r.color,'stroke-width':2,'data-resize':'yes'}));svg.append(g);
    }
  }
  const point=e=>{const r=svg.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};};
  svg.onpointerdown=e=>{if(e.button!==0||!visible)return;const p=point(e),id=e.target.closest('[data-id]')?.getAttribute('data-id');if(id){choose(id);const r=current();gesture={id,start:p,original:{...r},resize:e.target.hasAttribute('data-resize')};}
    else if(tool!=='select'){gesture={start:p,draft:{id:crypto.randomUUID(),surface:surface.key,label:surface.label+(surface.region?' · '+surface.region(p.x,p.y):''),type:tool,x:p.x,y:p.y,x2:p.x,y2:p.y,color:$('reviewColor').value,line:Number($('reviewLine').value),text:'',before:'',after:'',author:$('reviewAuthor').value.trim()||'나',category:'기타',comments:[],attachments:[],resolved:false}};}else{choose(null);return;}svg.setPointerCapture(e.pointerId);e.preventDefault();};
  svg.onpointermove=e=>{if(!gesture)return;const p=point(e);if(gesture.draft){gesture.draft.x2=p.x;gesture.draft.y2=tool==='underline'?gesture.start.y:p.y;draw();return;}
    const r=gesture.original,dx=Math.max(-Math.min(r.x,r.x2),Math.min(1-Math.max(r.x,r.x2),p.x-gesture.start.x)),dy=Math.max(-Math.min(r.y,r.y2),Math.min(1-Math.max(r.y,r.y2),p.y-gesture.start.y));
    gesture.next=gesture.resize?{...r,x2:p.x,y2:r.type==='underline'?r.y:p.y}:{...r,x:r.x+dx,y:r.y+dy,x2:r.x2+dx,y2:r.y2+dy};
    const old=state.printReview;state.printReview=rows().map(x=>x.id===r.id?gesture.next:x);draw();state.printReview=old;
  };
  svg.onpointerup=e=>{if(!gesture)return;const g=gesture;gesture=null;if(g.draft){const r=g.draft;if(r.type!=='pin'&&Math.hypot(r.x2-r.x,r.y2-r.y)<.008){draw();return;}commit([...rows(),r]);choose(r.id);setTool('select');$('reviewText').focus();}else if(g.next){g.next.label=surface.label+(surface.region?' · '+surface.region((g.next.x+g.next.x2)/2,(g.next.y+g.next.y2)/2):'');commit(rows().map(r=>r.id===g.id?g.next:r));}draw();};
  svg.onpointercancel=()=>{gesture=null;draw();};
  for(const [id,key]of [['reviewText','text'],['reviewBefore','before'],['reviewAfter','after'],['reviewCategory','category']])$(id).onchange=()=>update({[key]:$(id).value});
  $('reviewColor').onchange=()=>update({color:$('reviewColor').value});$('reviewLine').onchange=()=>update({line:Number($('reviewLine').value)});
  $('reviewVisible').onchange=()=>{visible=$('reviewVisible').checked;draw();};
  $('reviewDone').onclick=()=>{update({resolved:!current().resolved});choose(selected);};
  $('reviewDelete').onclick=()=>{if(confirm('이 표시와 수정 요청·댓글을 삭제할까요?')){commit(rows().filter(r=>r.id!==selected));choose(null);}};
  $('reviewReplyAdd').onclick=()=>{const r=current(),text=$('reviewReply').value.trim(),author=$('reviewAuthor').value.trim();if(!r||!text)return;if(!author){$('reviewAuthor').focus();showBanner('댓글 작성 이름을 입력해 주세요.',true);return;}update({comments:[...r.comments,{text,author,at:new Date().toISOString()}]});$('reviewReply').value='';threads();};
  $('reviewReply').onkeydown=e=>{if(!e.isComposing&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();$('reviewReplyAdd').click();}};
  $('reviewAttachment').onchange=async e=>{const id=selected,files=[...e.target.files];e.target.value='';if(!id)return;try{const loaded=[];for(const f of files){if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>10*1024*1024)throw Error('PNG·JPG·WebP, 10MB 이하만 첨부해 주세요.');const image=await loadImageFile(f);loaded.push({name:f.name,image});}const r=rows().find(r=>r.id===id);if(!r)return;if(r.attachments.length+loaded.length>4)throw Error('첨부는 최대 4장이에요.');commit(rows().map(r=>r.id===id?{...r,attachments:[...r.attachments,...loaded]}:r));if(selected===id)attachments();}catch(err){showBanner(err.message,true);}};
  $('reviewUndo').onclick=()=>{if(history.length){future.push(rows());state.printReview=history.pop();choose(rows().some(r=>r.id===selected)?selected:null);}};
  $('reviewRedo').onclick=()=>{if(future.length){history.push(rows());state.printReview=future.pop();choose(rows().some(r=>r.id===selected)?selected:null);}};
  $('reviewSurface').onchange=()=>{surface=surfaces.find(s=>s.key===$('reviewSurface').value);choose(null);paint();};
  launch.onclick=()=>{surfaces=getSurfaces();if(!surfaces.length)return;surface=surfaces[0];history=[];future=[];selected=null;$('reviewSurface').replaceChildren(...surfaces.map(s=>{const o=document.createElement('option');o.value=s.key;o.textContent=s.label;return o;}));choose(null);paint();setTool('box');modal.showModal();};
  $('reviewClose').onclick=()=>modal.close();modal.addEventListener('cancel',()=>{gesture=null;});
  $('reviewSave').onclick=()=>document.getElementById('saveProject').click();
  async function markedCanvas(s){const old=surface,oldSelected=selected,oldVisible=visible;surface=s;selected=null;visible=true;draw();const xml=new XMLSerializer().serializeToString(svg),im=new Image(),url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'}));try{im.src=url;await im.decode();const c=s.canvas();c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c;}finally{URL.revokeObjectURL(url);surface=old;selected=oldSelected;visible=oldVisible;draw();}}
  const surfaceRequests=s=>rows().map((r,i)=>({...r,number:i+1})).filter(r=>r.surface===s.key);
  $('reviewPng').onclick=async()=>{try{const pages=composeReviewPages(await markedCanvas(surface),surfaceRequests(surface));for(const [i,c]of pages.entries())downloadCanvasPng(c,`수정표시${pages.length>1?'-'+(i+1):''}.png`);}catch(err){showBanner(err.message,true);}};
  $('reviewPdf').onclick=async()=>{try{
    const canvases=[];for(const s of surfaces.filter(s=>rows().some(r=>r.surface===s.key)))canvases.push(...composeReviewPages(await markedCanvas(s),surfaceRequests(s)));
    if(!canvases.length){showBanner('현재 제품에 수정 표시를 먼저 추가해 주세요.',true);return;}
    await downloadCanvasesPdf(canvases,'수정요청.pdf');
  }catch(err){showBanner('PDF 저장 실패: '+err.message,true);}};
}
