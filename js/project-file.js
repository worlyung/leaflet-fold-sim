// Explicit state allowlist excludes renderers, DOM nodes and runtime handles.
import {validatePrintReview} from './print-review.js';
export const PROJECT_KEYS=['productMode','sizeId','foldId','orientation','foldAxis','deltaMm','customW','customH','viewMode','showSide','foldAmount','frontImage','backImage','panelImages','bookletSizeId','bookletCustomW','bookletCustomH','bookletOrient','bindingId','brochure','pageCount','pageImages','spreadIndex','parentSheetId','parentCustomW','parentCustomH','poster','photozone','book','surface','objectRotations','printReview'];
export function serializeProject(state,books){
 return JSON.stringify({format:'gomgom-print-project',version:1,state:Object.fromEntries(PROJECT_KEYS.map(k=>[k,state[k]])),books},(_key,v)=>{
 if(v instanceof HTMLImageElement||v instanceof HTMLCanvasElement){const c=document.createElement('canvas');c.width=v.naturalWidth||v.width;c.height=v.naturalHeight||v.height;c.getContext('2d').drawImage(v,0,0);return {$image:c.toDataURL('image/png')};}return v;
 });
}
export async function parseProject(text){
 const data=JSON.parse(text);if(data.format!=='gomgom-print-project'||data.version!==1)throw Error('작업 전체 저장 파일을 선택해 주세요.');
 async function decode(v,depth=0){if(depth>15)throw Error('파일 구조가 올바르지 않아요.');if(v===null||typeof v!=='object')return v;if(v.$image){if(typeof v.$image!=='string'||!v.$image.startsWith('data:image/png;base64,'))throw Error('이미지 형식 오류');const im=new Image();im.src=v.$image;await im.decode();return im;}if(Array.isArray(v))return Promise.all(v.map(x=>decode(x,depth+1)));const o={};for(const[k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))throw Error('잘못된 설정');o[k]=await decode(x,depth+1);}return o;}
 const result=await decode(data),s=result.state;
 validatePrintReview(s?.printReview);
 if(!s||!['fold','booklet','poster','photozone'].includes(s.productMode)||!Number.isInteger(s.pageCount)||s.pageCount<4||s.pageCount>512||!Array.isArray(s.pageImages)||s.pageImages.length!==s.pageCount)throw Error('페이지 설정이 올바르지 않아요.');
 for(const key of ['poster','photozone']){const o=s[key];if(!o||![o.width,o.height].every(n=>Number.isFinite(n)&&n>=50&&n<=20000))throw Error('크기 설정이 올바르지 않아요.');}
 const numeric=(o,key,min,max)=>{if(!Number.isFinite(o?.[key])||o[key]<min||o[key]>max)throw Error(`설정 범위 오류: ${key}`);};
 for(const key of ['customW','customH','bookletCustomW','bookletCustomH','parentCustomW','parentCustomH'])numeric(s,key,1,20000);
 numeric(s,'foldAmount',0,1);numeric(s.surface,'gsm',60,400);numeric(s.surface,'thickness',0.05,1);
 if(!['snow','art','uncoated','textured','kraft'].includes(s.surface?.paper)||!['none','matte','gloss','epoxy'].includes(s.surface?.finish))throw Error('종이 설정 오류');
 for(const key of ['depth','section','printWidth','printHeight','personHeight'])numeric(s.photozone,key,1,20000);
 function book(o){numeric(o,'pageCount',4,512);if(!Array.isArray(o.pageImages)||o.pageImages.length!==o.pageCount)throw Error('책 내지 목록 오류');numeric(o.book,'paperThickness',0.05,0.5);numeric(o.book,'coverThickness',0.1,8);numeric(o.book,'open',0,360);numeric(o.book,'turn',0,1);}
 book(s);for(const o of Object.values(result.books||{}))book(o);
 return result;
}
export function initProjectFile({state,books,snapshotBooks,restore,showBanner}){
 const section=document.createElement('section');section.className='section';section.innerHTML='<h2>작업 전체 저장 · 이어서 작업</h2><button id="saveProject">작업 전체 저장</button><label>작업 파일 열기 <input id="loadProject" type="file" accept=".json,application/json"></label><p class="hint">리플렛 A/B면·구역별 이미지, 책 내지·표지, 현수기 4면과 모든 제작 설정을 함께 저장해요. 자동 저장은 아니에요.</p>';document.querySelector('.sidebar').prepend(section);
 document.getElementById('saveProject').onclick=()=>{try{snapshotBooks();const text=serializeProject(state,books);if(text.length>200000000)throw Error('작업이 200MB를 넘어요. 원본 이미지를 줄여 주세요.');const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='곰곰-인쇄작업.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showBanner('작업 전체 파일을 저장했어요.',false);}catch(e){showBanner(e.message,true);}};
 document.getElementById('loadProject').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>200000000)throw Error('200MB 이하 파일을 선택해 주세요.');const data=await parseProject(await f.text());restore(data);showBanner('이미지와 설정을 복원했어요.',false);}catch(err){showBanner('작업 불러오기 실패: '+err.message,true);}finally{e.target.value='';}};
}
