// Optional same-origin embedded mode; standalone print studio remains independent.
export function connectTurdam({state,renderAll,showBanner}){
  if(parent===window||new URLSearchParams(location.search).get('turdam')!=='photozone')return;
  let session=null;
  const button=document.createElement('button');button.id='applyToTurdam';button.type='button';button.textContent='터담 지도에 반영';button.disabled=true;
  button.style.cssText='background:#256752;color:white;padding:12px 18px;border:0;border-radius:6px;font-weight:bold';
  document.querySelector('#panelPhotozone').prepend(button);
  const encode=image=>{if(!image)return '';const c=document.createElement('canvas'),scale=Math.min(1,1600/image.width);c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c.toDataURL('image/png');};
  const decode=src=>new Promise((resolve,reject)=>{if(!src)return resolve(null);if(!/^data:image\/(png|jpeg|webp);base64,/.test(src))return reject(Error('이미지 형식 오류'));const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('이미지를 읽지 못했어요.'));img.src=src;});
  const fields={zoneWidth:'width',zoneHeight:'height',zoneDepth:'depth',zoneSection:'section',zonePrintW:'printWidth',zonePrintH:'printHeight',zoneMount:'mount',zoneColor:'backColor',zonePrint:'showPrint',zoneBraces:'braces',zoneFeet:'feet',zoneWeights:'weights'};
  window.addEventListener('message',async e=>{
    if(e.origin!==location.origin||e.source!==parent)return;
    if(e.data?.type==='turdam-photozone-error'){button.disabled=false;showBanner(e.data.message,true);return;}
    if(e.data?.type!=='turdam-photozone-init'||typeof e.data.session!=='string')return;
    session=e.data.session;
    try{if(e.data.config){const c=e.data.config;for(const key of Object.values(fields))if(c[key]!==undefined)state.photozone[key]=c[key];state.photozone.front=await decode(c.front);state.photozone.back=await decode(c.back);}
      for(const [id,key] of Object.entries(fields)){const el=document.getElementById(id);if(el.type==='checkbox')el.checked=state.photozone[key];else el.value=state.photozone[key];}
      document.querySelector('#modeToggle [data-mode="photozone"]').click();renderAll();button.disabled=false;
    }catch(err){showBanner(err.message,true);}
  });
  button.onclick=()=>{try{const config={...state.photozone,front:encode(state.photozone.front),back:encode(state.photozone.back)};if(config.front.length>6000000||config.back.length>6000000)throw Error('이미지가 커요. 작은 이미지로 다시 넣어 주세요.');button.disabled=true;parent.postMessage({type:'turdam-photozone-apply',session,config},location.origin);}catch(err){showBanner(err.message,true);}};
  parent.postMessage({type:'turdam-photozone-ready'},location.origin);
}
