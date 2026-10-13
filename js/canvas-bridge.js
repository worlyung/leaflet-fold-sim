// Design exchange with the local Canvas. No generation is triggered automatically.
export function connectCanvas({state,getSize,getBookletPageSize,bookDimensions,renderAll,rebuildBookletPageList,showBanner}){
  const origin='http://localhost:3000';let session=null;
  const encode=image=>{if(!image)return '';const c=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(image.width,image.height));c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return c.toDataURL('image/png');};
  const foldSize=()=>{const s=getSize();let w=s.widthMm,h=s.heightMm;if(state.orientation==='landscape'&&w<h||state.orientation==='portrait'&&w>h)[w,h]=[h,w];return {widthMm:w,heightMm:h};};
  const entries=[['frontFile','리플렛 A면',()=>state,'frontImage',foldSize],['backFile','리플렛 B면',()=>state,'backImage',foldSize]];
  for(const [id,name,kind,key] of [['posterFront','포스터 앞면','poster','front'],['posterBack','포스터 뒷면','poster','back'],['zoneFront','포토존 앞면','photozone','front'],['zoneBack','포토존 뒷면','photozone','back'],['bookFront','책 앞표지','book','front'],['bookBack','책 뒷표지','book','back'],['bookSpine','책등','book','spine']]){
    entries.push([id,name,()=>state[kind],key,()=>{
      if(kind==='book'){const p=getBookletPageSize();return {widthMm:key==='spine'?bookDimensions({...state.book,binding:state.bindingId,pages:state.pageImages.slice(1,-1)}).thickness:p.widthMm,heightMm:p.heightMm};}
      const o=state[kind];return {widthMm:kind==='photozone'?o.printWidth:o.width,heightMm:kind==='photozone'?o.printHeight:o.height};
    }]);
  }
  for(const [id,name,object,key,size] of entries){
    const input=document.getElementById(id);if(!input)continue;
    const button=document.createElement('button');button.type='button';button.id=id+'Canvas';button.textContent='곰곰 캔버스에서 디자인 ↗';button.style.cssText='margin-top:6px;width:100%;padding:9px;background:#285a46;color:white;border:0;border-radius:6px';input.closest('.field,.file-btn').after(button);
    button.onclick=()=>{
      try{const dims=size(),target=object(),token=crypto.randomUUID(),url=new URL(origin);url.searchParams.set('turdam',token);url.searchParams.set('origin',location.origin);
        const image=encode(target[key]);if(image.length>6000000)throw Error('기존 이미지가 너무 커요. 작은 이미지로 다시 넣어 주세요.');
        const popup=window.open(url.href,'_blank');if(!popup)throw Error('팝업을 허용한 뒤 다시 눌러 주세요.');
        session={popup,token,target,key,object,size,dims,image,name,id,original:target[key],mode:state.productMode};
        showBanner('캔버스에서 디자인한 뒤 터담에 적용을 눌러 주세요.');
      }catch(e){showBanner(e.message,true);}
    };
  }
  window.addEventListener('message',async e=>{
    const s=session;if(!s||e.source!==s.popup||e.origin!==origin||e.data?.token!==s.token)return;
    if(e.data.type==='turdam-canvas-ready'){s.popup.postMessage({type:'turdam-canvas-init',token:s.token,name:s.name,width:s.dims.widthMm/1000,height:s.dims.heightMm/1000,image:s.image},origin);return;}
    if(e.data.type!=='turdam-canvas-result')return;
    const valid=()=>session===s&&s.object()===s.target&&s.target[s.key]===s.original&&JSON.stringify(s.size())===JSON.stringify(s.dims)&&state.productMode===s.mode;
    try{
      if(!valid())throw Error('대상 면이나 규격이 바뀌었어요. 해당 면에서 다시 연결해 주세요.');
      const src=e.data.image;if(typeof src!=='string'||src.length>12000000||!/^data:image\/png;base64,/.test(src))throw Error('이미지 형식이나 크기를 확인해 주세요.');
      const image=new Image();image.src=src;await image.decode();if(!valid())throw Error('대상 면이 바뀌었어요. 다시 연결해 주세요.');
      s.target[s.key]=image;s.original=image;
      const status=document.getElementById(s.id+'Status');if(status)status.textContent='곰곰 캔버스 디자인';
      if(s.target===state.book)rebuildBookletPageList();renderAll();
      let download=document.getElementById(s.id+'CanvasDownload');if(!download){download=document.createElement('a');download.id=s.id+'CanvasDownload';download.textContent='적용 이미지 PNG 저장';download.style.display='block';document.getElementById(s.id+'Canvas').after(download);}download.href=src;download.download=s.name+'.png';
      showBanner(s.name+'에 적용했어요. 원본 보관은 적용 이미지 PNG 저장을 이용하세요.');
      s.popup.postMessage({type:'turdam-canvas-applied',token:s.token,message:s.name+'에 적용했어요. 인쇄물·포토존 스튜디오에서 확인하세요.'},origin);
    }catch(err){s.popup.postMessage({type:'turdam-canvas-applied',token:s.token,error:err.message},origin);showBanner(err.message,true);}
  });
}
