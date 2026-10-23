import { SceneViewer } from './scene-viewer.js';
import { Poster3DViewer } from './poster-3d.js';
import { PAPERS, defaultSurface } from './print-material.js';

export function initPrintOptions({state,renderAll,loadImageFile,showBanner,getSize,getBookletPageSize}){
  const $=s=>document.querySelector(s);
  state.surface=defaultSurface();
  const section=document.createElement('section');section.className='section';section.id='printSurface';
  section.innerHTML=`<h2>종이 · 표면 비교</h2>
    <label>용지 <select id="paperStock">${Object.entries(PAPERS).map(([k,p])=>`<option value="${k}">${p.name}</option>`).join('')}</select></label>
    <div class="row"><label>평량 g/㎡ <input id="paperGsm" type="number" min="60" max="400" value="150"></label>
    <label>두께 mm <input id="paperCaliper" type="number" min="0.05" max="1" step="0.005" value="0.135"></label></div>
    <button id="applyPaperToBook" type="button">이 두께를 책 내지에 적용</button>
    <p class="hint">용지·평량별 두께는 추정값이에요. 실측값으로 수정할 수 있어요. 판매 규격·촉감·색상 보증용이 아니에요.</p>
    <label>마감 <select id="paperFinish"><option value="none">무코팅</option><option value="gloss">유광 코팅</option><option value="matte">무광 코팅</option><option value="epoxy">무광 + 앞면 부분 에폭시</option></select></label>
    <label>에폭시 적용 위치 · 흑백 이미지 <input id="epoxyMask" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <p class="hint">디자인과 같은 비율의 흑백 이미지: 흰색은 적용, 검정은 제외. 리플렛은 펼친 종이 A면, 책은 앞표지 기준이에요. 영역 이미지가 없으면 에폭시 효과가 나타나지 않아요.</p>
    <button id="clearEpoxy" type="button">에폭시 영역 지우기</button><output id="epoxyStatus">영역 없음</output>
    <label>조명 방향 <input id="materialLight" type="range" min="-170" max="170" value="35"></label>
    <button id="compareMaterials" type="button">앞면 디자인 · 마감 3종 비교</button>
    <p class="hint">재질은 3D 미리보기에 적용돼요. 배너·현수막·백월에는 종이 마감을 적용하지 않아요.</p>`;
  $('.sidebar').append(section);
  $('#panelPoster').insertAdjacentHTML('afterbegin',`<section class="section"><h2>출력물 종류</h2><select id="printKind"><option value="poster">포스터</option><option value="banner">거치형 배너</option><option value="fabric">현수막</option><option value="lamp">가로등 현수기</option></select>
    <div id="bannerOptions" hidden><label>거치대 <select id="bannerStand"><option value="x">기본 거치대</option><option value="water">실외 물통형</option></select></label></div>
    <div id="fabricOptions" hidden><label>마감 <select id="fabricFinish"><option value="eyelet">모서리 타공</option><option value="pole">상하 봉</option></select></label></div><p class="hint">예시 크기를 자유롭게 수정할 수 있어요. 지지대는 외형 확인용이에요.</p></section>`);
  $('#posterWidth').max=20000;$('#posterHeight').max=10000;
  $('#panelPoster').insertAdjacentHTML('afterbegin','<section id="lampMountOptions" class="section" hidden><h2>가로등 현수기 설치</h2><label>고정 방식 <select id="lampMount"><option value="top">상단만 고정 (기본)</option><option value="both">상·하단 고정</option></select></label><label>바람 세기 · 0은 정지 <input id="lampWind" type="range" min="0" max="100" value="25"></label><p class="hint">천의 움직임을 보여주는 시각 효과예요. 실제 풍속·구조 계산값은 아니에요.</p></section>');
  $('#lampMount').onchange=e=>{state.poster.lampMount=e.target.value;renderAll();};$('#lampWind').oninput=e=>{state.poster.wind=Number(e.target.value);renderAll();};
  const left=document.createElement('section');left.id='lampLeftImages';left.className='section';
  left.innerHTML='<h2>가로등 왼쪽 현수기</h2><p class="hint">정면에서 본 왼쪽·오른쪽 기준이에요. 가로·세로 규격은 현수기 한 장의 크기예요.</p>'+['Front','Back'].map((s)=>`<div class="field"><label for="lampLeft${s}">왼쪽 ${s==='Front'?'앞면':'뒷면'} 이미지</label><input type="file" accept="image/*" id="lampLeft${s}"><button type="button" id="clearLamp${s}">이미지 지우기</button><output id="lamp${s}Status">이미지 없음</output></div>`).join('');$('#panelPoster').append(left);
  for(const s of ['Front','Back']){const key='left'+s;$('#lampLeft'+s).onchange=async e=>{try{if(!e.target.files[0])return;state.poster[key]=await loadImageFile(e.target.files[0]);$('#lamp'+s+'Status').textContent='이미지 적용됨';renderAll();}catch{showBanner('이미지를 읽지 못했어요.',true);}};$('#clearLamp'+s).onclick=()=>{state.poster[key]=null;$('#lampLeft'+s).value='';$('#lamp'+s+'Status').textContent='이미지 없음';renderAll();};}
  $('#modeToggle [data-mode="poster"]').textContent='포스터 · 배너 · 현수막·현수기';
  $('#modeToggle [data-mode="photozone"]').textContent='포토존 · 백월';
  $('#panelPhotozone').insertAdjacentHTML('afterbegin',`<section class="section"><h2>백월 구성</h2><button id="backwallPreset" type="button">평면 백월 · 트러스 덮기</button><p class="hint">기존 구조와 출력물을 유지하며 트러스 앞면을 덮어요. 규격·뒷받침·이미지는 아래에서 조절해요.</p></section>`);
  const update=()=>{SceneViewer.printSurface=state.surface;renderAll();};
  $('#applyPaperToBook').onclick=()=>{state.book.paperThickness=Math.min(0.5,state.surface.thickness);$('#bookPaperThickness').value=state.book.paperThickness;update();showBanner('책 내지 두께에 적용했어요. 표지 두께는 별도로 유지해요.',false);};
  $('#printKind').onchange=e=>{
    const o=state.poster;o.kind=e.target.value;[o.width,o.height]=o.kind==='lamp'?[600,1800]:o.kind==='banner'?[600,1800]:o.kind==='fabric'?[5000,900]:[420,594];
    $('#posterWidth').value=o.width;$('#posterHeight').value=o.height;update();
    showBanner(`앞면 이미지를 넣고 ${{poster:'포스터',banner:'배너',fabric:'현수막',lamp:'가로등 현수기'}[o.kind]}을 돌려보세요. 뒷면 이미지는 선택 사항이에요.`,false);
  };
  $('#bannerStand').onchange=e=>{state.poster.stand=e.target.value;update();};
  $('#fabricFinish').onchange=e=>{state.poster.finish=e.target.value;update();};
  $('#backwallPreset').onclick=()=>{state.photozone.mount='cover';state.photozone.printWidth=state.photozone.width;state.photozone.printHeight=state.photozone.height;
    $('#zoneMount').value='cover';$('#zonePrintW').value=state.photozone.width;$('#zonePrintH').value=state.photozone.height;update();};
  const thickness=()=>{state.surface.thickness=Math.max(0.05,+(state.surface.gsm*PAPERS[state.surface.paper].bulk/1000).toFixed(3));$('#paperCaliper').value=state.surface.thickness;};
  $('#paperStock').onchange=e=>{state.surface.paper=e.target.value;thickness();update();};
  for(const [id,key,min,max] of [['paperGsm','gsm',60,400],['paperCaliper','thickness',0.05,1]]) $('#'+id).onchange=e=>{
    state.surface[key]=Math.min(max,Math.max(min,Number(e.target.value)||min));e.target.value=state.surface[key];if(key==='gsm')thickness();update();};
  $('#paperFinish').onchange=e=>{state.surface.finish=e.target.value;update();};
  $('#materialLight').oninput=e=>{state.surface.light=Number(e.target.value);update();};
  $('#epoxyMask').onchange=async e=>{try{if(!e.target.files[0])return;state.surface.mask=await loadImageFile(e.target.files[0]);$('#epoxyStatus').textContent='영역 적용됨';update();}catch{showBanner('영역 이미지를 읽지 못했어요.',true);}};
  $('#clearEpoxy').onclick=()=>{state.surface.mask=null;$('#epoxyMask').value='';$('#epoxyStatus').textContent='영역 없음';update();};
  const dialog=document.createElement('dialog');dialog.id='materialComparison';
  dialog.innerHTML=`<button id="closeCompare">닫기</button><h2>동일 디자인 · 동일 조명</h2><p>드래그로 돌려보고 조명 방향을 바꿔 보세요. 부분 에폭시는 지정한 영역에만 적용돼요.</p><input aria-label="비교 조명 방향" id="compareLight" type="range" min="-170" max="170" value="35"><div id="comparisonGrid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px"></div>`;
  dialog.style.cssText='width:min(1200px,94vw);max-height:90vh;background:#eef1ee;color:#223b30;border:0;border-radius:16px;padding:20px';document.body.append(dialog);$('#closeCompare').style.color='white';
  let viewers=[];
  const clear=()=>{viewers.forEach(v=>v.dispose());viewers=[];$('#comparisonGrid').replaceChildren();};dialog.addEventListener('close',clear);$('#closeCompare').onclick=()=>dialog.close();
  $('#compareMaterials').onclick=()=>{
    clear();dialog.showModal();const size=state.productMode==='fold'?getSize():state.productMode==='booklet'?getBookletPageSize():{widthMm:state.poster.width,heightMm:state.poster.height};
    const front=state.productMode==='fold'?state.frontImage:state.productMode==='booklet'?(state.book.front||state.pageImages[0]):state.poster.front;
    for(const [finish,title] of [['gloss','유광'],['matte','무광'],['epoxy','무광 + 부분 에폭시']]){
      const card=document.createElement('div');const label=document.createElement('h3');label.textContent=title;const mount=document.createElement('div');mount.style.height='380px';card.append(label,mount);$('#comparisonGrid').append(card);
      const v=new Poster3DViewer(mount);v.build({width:size.widthMm,height:size.heightMm,front,backColor:'#eee'});
      const surface={...state.surface,finish};v.surface=surface;
      // Poster build normally follows shared surface; pin this preview's finish.
      v.build=function(o){this.clearRoot();this.sheet(o.width,o.height,surface.thickness,o.front||this.label('재질 비교'),null);this.finishBuild();};
      v.options={width:size.widthMm,height:size.heightMm,front};v.build(v.options);v.frameCamera('front');viewers.push(v);
    }
    $('#compareLight').value=state.surface.light;
  };
  $('#compareLight').oninput=e=>{for(const v of viewers){v.surface.light=Number(e.target.value);v.build(v.options);}};
  // Save this feature's settings and artwork without changing existing template storage.
  const save=document.createElement('section');save.className='section';save.innerHTML='<h2>제작 설정 파일</h2><button id="savePrintSettings">설정·출력 이미지 저장</button><label>설정 불러오기 <input id="loadPrintSettings" type="file" accept="application/json"></label><p class="hint">포스터·배너·현수막·백월 이미지와 규격, 종이·마감을 저장해요. 리플렛 면별 이미지와 책 내지는 포함하지 않아요.</p>';$('.sidebar').append(save);
  const encode=o=>{if(o instanceof HTMLImageElement||o instanceof HTMLCanvasElement){const c=document.createElement('canvas');c.width=o.width;c.height=o.height;c.getContext('2d').drawImage(o,0,0);return {image:c.toDataURL('image/png')};}return o;};
  $('#savePrintSettings').onclick=()=>{const text=JSON.stringify({version:1,poster:state.poster,photozone:state.photozone,surface:state.surface},(_k,v)=>encode(v));const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='인쇄물-제작설정.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('#loadPrintSettings').onchange=async e=>{try{
    const f=e.target.files[0];if(!f)return;if(f.size>40000000)throw Error('40MB 이하 파일을 선택해 주세요.');const data=JSON.parse(await f.text());if(data.version!==1)throw Error('지원하지 않는 설정 파일이에요.');
    const decoded={};for(const group of ['poster','photozone','surface']){const src=data[group];if(!src||typeof src!=='object')throw Error('설정이 누락됐어요.');decoded[group]={};for(const [key,val] of Object.entries(src)){
      if(val?.image){if(!/^data:image\/png;base64,/.test(val.image))throw Error('잘못된 이미지예요.');const im=new Image();im.src=val.image;await im.decode();decoded[group][key]=im;}
      else if(!['__proto__','constructor','prototype'].includes(key)&&(['string','number','boolean'].includes(typeof val)||val===null))decoded[group][key]=val;
    }}
    const s=decoded.surface;if(!PAPERS[s.paper]||!['none','matte','gloss','epoxy'].includes(s.finish)||!Number.isFinite(s.gsm)||s.gsm<60||s.gsm>400||!Number.isFinite(s.thickness)||s.thickness<0.05||s.thickness>1)throw Error('종이 설정 범위가 올바르지 않아요.');
    for(const group of ['poster','photozone'])for(const key of ['width','height'])if(!Number.isFinite(decoded[group][key])||decoded[group][key]<50||decoded[group][key]>20000)throw Error('크기 범위가 올바르지 않아요.');
    Object.assign(state.surface,s);Object.assign(state.poster,decoded.poster);Object.assign(state.photozone,decoded.photozone);
    const zoneFields={zoneDepth:'depth',zoneSection:'section',zoneMount:'mount',zoneColor:'backColor',zonePrint:'showPrint',zoneBraces:'braces',zoneFeet:'feet',zoneWeights:'weights',zonePerson:'person',zonePersonHeight:'personHeight'};
    for(const [id,key] of Object.entries(zoneFields)){const el=$('#'+id);if(el.type==='checkbox')el.checked=state.photozone[key];else el.value=state.photozone[key];}
    $('#posterColor').value=state.poster.backColor;
    const fields={posterWidth:state.poster.width,posterHeight:state.poster.height,printKind:state.poster.kind||'poster',bannerStand:state.poster.stand||'x',fabricFinish:state.poster.finish||'eyelet',paperStock:s.paper,paperGsm:s.gsm,paperCaliper:s.thickness,paperFinish:s.finish,materialLight:s.light,zoneWidth:state.photozone.width,zoneHeight:state.photozone.height,zonePrintW:state.photozone.printWidth,zonePrintH:state.photozone.printHeight};for(const [id,val]of Object.entries(fields))$('#'+id).value=val;
    $('#epoxyStatus').textContent=s.mask?'영역 적용됨':'영역 없음';update();showBanner('제작 설정을 불러왔어요.',false);
  }catch(err){showBanner(err.message,true);}finally{e.target.value='';}};
  SceneViewer.printSurface=state.surface;
  return {sync(){
    const name={banner:'배너',fabric:'현수막',lamp:'가로등 현수기'}[state.poster.kind]||'포스터';
    $('#posterWidth').closest('.section').querySelector('h2').textContent=`${name} 규격`;
    for(const [id,side] of [['posterFront','앞면'],['posterBack','뒷면']]){
      $(`label[for="${id}"]`).textContent=`${name} ${state.poster.kind==='lamp'?'오른쪽 ':''}${side} 이미지${side==='뒷면'?' (선택)':''}`;
      $(`[data-clear="${id}"]`).setAttribute('aria-label',`${name} ${side} 이미지 지우기`);
    }
    $('label[for="posterColor"]').textContent='이미지가 없는 뒷면 색상';
    $('#lampLeftImages').hidden=state.poster.kind!=='lamp';
    $('#lampMountOptions').hidden=state.poster.kind!=='lamp';$('#lampMount').value=state.poster.lampMount||'top';$('#lampWind').value=state.poster.wind??25;
    $('#posterColor').closest('.section').querySelector('p.hint').textContent='뒷면 이미지를 넣지 않으면 지정한 색상으로 보여요.';
    SceneViewer.printSurface=state.surface;section.hidden=state.productMode==='photozone'||(state.productMode==='poster'&&state.poster.kind&&state.poster.kind!=='poster');$('#bannerOptions').hidden=state.poster.kind!=='banner';$('#fabricOptions').hidden=state.poster.kind!=='fabric';
  }};
}
