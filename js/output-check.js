import {layoutImage,fittedImage} from './image-layout.js';
export function initOutputCheck({state,renderAll,getSize,getBookletPageSize}){
 const el=document.createElement('section');el.className='section';el.id='outputCheck';el.innerHTML=`<h2>이미지 맞춤 · 출력 화질</h2><div id="fitControls"><label>이미지 배치 <select id="imageFit"><option value="stretch">기존 방식 · 비율 늘림</option><option value="contain">전체 맞춤 · 여백 허용</option><option value="cover">꽉 채우기 · 가운데 잘림</option></select></label><label>여백 색 <input id="fitColor" type="color" value="#ffffff"></label><p class="hint">포스터·배너·현수막·현수기·백월의 모든 면에 적용돼요. 원본은 보존돼요.</p></div><label>화질 확인 기준 <select id="ppiTarget"><option value="150">150 PPI · 일반 참고</option><option value="300">300 PPI · 가까이 보는 인쇄물</option><option value="75">75 PPI · 멀리 보는 대형 출력</option></select></label><p class="hint">실제 출력 크기의 해상도예요. 기준은 참고용이며 인쇄소 사양을 우선해요.</p><div id="qualityRows"></div>`;
 document.querySelector('.sidebar').append(el);const $=id=>document.getElementById(id);
 const active=()=>state.productMode==='photozone'?state.photozone:state.poster;
 $('imageFit').onchange=e=>{active().fit=e.target.value;renderAll();};$('fitColor').oninput=e=>{active().fitColor=e.target.value;renderAll();};$('ppiTarget').onchange=()=>sync();
 function sync(){
 const rows=[],extra=['poster','photozone'].includes(state.productMode);$('fitControls').hidden=!extra;
 if(extra){const o=active(),zone=state.productMode==='photozone',w=zone?o.printWidth:o.width,h=zone?o.printHeight:o.height;$('imageFit').value=o.fit||'stretch';$('fitColor').value=o.fitColor||'#ffffff';
 for(const [key,name]of [['front',o.kind==='lamp'?'오른쪽 앞면':'앞면'],['back',o.kind==='lamp'?'오른쪽 뒷면':'뒷면'],...(o.kind==='lamp'?[['leftFront','왼쪽 앞면'],['leftBack','왼쪽 뒷면']]:[])])rows.push({name,image:o[key],w,h,fit:o.fit,color:o.fitColor});
 }else if(state.productMode==='fold'){let {widthMm:w,heightMm:h}=getSize();if((state.orientation==='landscape'&&w<h)||(state.orientation==='portrait'&&w>h))[w,h]=[h,w];rows.push({name:'종이 A면',image:state.frontImage,w,h},{name:'종이 B면',image:state.backImage,w,h});}
 else{const {widthMm:w,heightMm:h}=getBookletPageSize();state.pageImages.forEach((im,i)=>rows.push({name:`${i+1}쪽`,image:i===0?(state.book.front||im):i===state.pageCount-1?(state.book.back||im):im,w,h}));}
 $('qualityRows').replaceChildren();for(const r of rows){const p=document.createElement('p');p.className='hint';if(!r.image){p.textContent=r.name+' · 이미지 없음';$('qualityRows').append(p);continue;}
 const a=layoutImage(r.image.naturalWidth||r.image.width,r.image.naturalHeight||r.image.height,r.w,r.h,r.fit);p.textContent=`${r.name} · ${Math.round(a.ppi)} PPI · ${a.ppi<Number($('ppiTarget').value)?'기준 미달: 더 큰 원본 권장':'설정 기준 충족'}${a.crop>0.001?` · 이미지 면적 ${Math.round(a.crop*100)}% 잘림`:''}`;$('qualityRows').append(p);
 if(extra){const preview=fittedImage(r.image,r.w,r.h,r.fit||'stretch',r.color),c=document.createElement('canvas');c.width=260;c.height=Math.max(16,Math.round(260*r.h/r.w));c.style.cssText='width:100%;max-height:240px;object-fit:contain;background:#111';c.getContext('2d').drawImage(preview,0,0,c.width,c.height);$('qualityRows').append(c);}
 }
 }
 return {sync};
}
