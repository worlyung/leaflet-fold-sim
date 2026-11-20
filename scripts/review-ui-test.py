"""Real browser review workflow; uses local vendor assets to avoid CDN dependency."""
import functools,json,threading,os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright

source=Path(__file__).resolve().parents[1]
root=Path(os.environ.get('REVIEW_ROOT',str(source)))
vendor=Path(os.environ.get('REVIEW_VENDOR',str(Path.home()/'tools/festbg-release-0.10.9/node_modules')))
out=source/'.tmp/review-tests';out.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as pw:
    browser=pw.chromium.launch(**({} if os.environ.get('REVIEW_BROWSER')=='chromium' else {'channel':'msedge'}))
    p=browser.new_page(viewport={'width':1366,'height':900},accept_downloads=True)
    p.route('https://unpkg.com/three@0.170.0/**',lambda r:r.fulfill(path=str(vendor/'three-print'/r.request.url.split('0.170.0/')[1])))
    p.route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**',lambda r:r.fulfill(path=str(vendor/'pdf-lib/dist/pdf-lib.min.js')))
    p.route('**/vendor/**',lambda r:r.fulfill(path=str(vendor/r.request.url.split('/vendor/')[1])))
    errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    p.goto(f'http://127.0.0.1:{server.server_port}')
    p.locator('#printReviewOpen').wait_for()
    p.locator('#frontFile').set_input_files(str(root/'fixtures/fold-front.png'))
    p.locator('#printReviewOpen').click()
    def mark(tool,x,y,x2,y2):
        p.locator(f'[data-tool={tool}]').click()
        r=p.locator('#reviewMarks').bounding_box()
        p.mouse.move(r['x']+r['width']*x,r['y']+r['height']*y);p.mouse.down()
        p.mouse.move(r['x']+r['width']*x2,r['y']+r['height']*y2,steps=8);p.mouse.up()
    mark('box',.05,.15,.2,.3)
    assert p.locator('#reviewSheet #reviewText').is_visible()
    p.locator('summary').filter(has_text='문구 교체 · 사진 · 댓글').click()
    p.locator('#reviewAuthor').fill('검토자')
    p.locator('#reviewBefore').fill('12월 7일')
    p.locator('#reviewAfter').fill('12월 8일')
    p.locator('#reviewText').fill('행사 날짜 수정')
    title=p.locator('#reviewInline strong');box=title.bounding_box()
    p.mouse.move(box['x']+20,box['y']+8);p.mouse.down();p.mouse.move(box['x']+20,box['y']+65,steps=6);p.mouse.up()
    assert title.bounding_box()['y']>box['y']+30
    p.locator('#reviewReply').fill('확인했습니다');p.locator('#reviewReply').press('Control+Enter')
    p.locator('#reviewAttachment').set_input_files(str(root/'fixtures/page-1.png'))
    p.locator('#reviewAttachments img').wait_for()
    p.locator('#reviewFont').select_option('20')
    p.locator('#reviewOpacity').fill('55');p.locator('#reviewOpacity').dispatch_event('change')
    p.get_by_role('button',name='입력 완료',exact=True).click()
    assert p.locator('#reviewCards').get_by_text('행사 날짜 수정',exact=False).is_visible()
    assert not p.locator('.review-layout aside').is_visible()
    card=p.locator('.review-card').first;handle=card.locator('.review-card-resize');r=handle.bounding_box();cw=card.bounding_box()['width']
    p.mouse.move(r['x']+5,r['y']+5);p.mouse.down();p.mouse.move(r['x']-35,r['y']+5,steps=5);p.mouse.up()
    assert card.bounding_box()['width']<cw-20
    for i,t in enumerate(['circle','underline','arrow','pin']):mark(t,.25+i*.16,.38,.35+i*.16,.55)
    assert p.locator('#reviewMarks > g').count()==5
    p.locator('.review-card-body').filter(has_text='행사 날짜 수정').click()
    shape=p.locator('#reviewMarks > g').first.locator('rect')
    before=shape.get_attribute('x')
    r=shape.bounding_box();p.mouse.move(r['x']+10,r['y']+10);p.mouse.down();p.mouse.move(r['x']+35,r['y']+25,steps=6);p.mouse.up()
    assert shape.get_attribute('x')!=before
    handle=p.locator('[data-resize]');r=handle.bounding_box()
    width=shape.get_attribute('width')
    p.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);p.mouse.down();p.mouse.move(r['x']+45,r['y']+30,steps=6);p.mouse.up()
    assert shape.get_attribute('width')!=width
    # Undo both geometry edits so the creation undo/redo assertions remain stable.
    p.locator('#reviewUndo').click();p.locator('#reviewUndo').click()
    p.locator('#reviewUndo').click();assert p.locator('#reviewMarks > g').count()==4
    p.locator('#reviewRedo').click();assert p.locator('#reviewMarks > g').count()==5
    p.locator('#reviewVisible').uncheck();assert p.locator('#reviewMarks > g').count()==0
    p.locator('#reviewVisible').check();assert p.locator('#reviewMarks > g').count()==5
    p.locator('#reviewSurface').select_option(index=1);assert p.locator('#reviewMarks > g').count()==0
    mark('pin',.15,.2,.15,.2)
    p.locator('#reviewSurface').select_option(index=0)
    p.locator('.review-card-body').filter(has_text='행사 날짜 수정').click();assert p.locator('#reviewMarks > g').count()==5
    assert p.locator('#reviewText').input_value()=='행사 날짜 수정'
    assert '확인했습니다' in p.locator('#reviewComments').inner_text()
    p.locator('#reviewDone').click();assert p.locator('#reviewDone').inner_text()=='다시 열기'
    p.locator('#reviewDone').click()
    for button,name in [('reviewPng','review.png'),('reviewPdf','review.pdf'),('reviewSave','review.json')]:
        with p.expect_download() as event:p.locator('#'+button).click()
        event.value.save_as(str(out/name))
        assert (out/name).stat().st_size>100
    data=json.loads((out/'review.json').read_text(encoding='utf-8'))
    assert len(data['state']['printReview'])==6
    assert len(data['state']['printReview'][0]['attachments'])==1
    assert 0<data['state']['printReview'][0]['noteX']<1
    assert data['state']['printReview'][0]['noteFont']==20
    assert data['state']['printReview'][0]['noteOpacity']==.55
    assert data['state']['printReview'][0]['noteWidth']>0
    result=p.evaluate('''async text=>{const {parseProject}=await import('./js/project-file.js');const d=JSON.parse(text);d.state.printReview[0].x=-1;try{await parseProject(JSON.stringify(d));return false;}catch{return true;}}''',(out/'review.json').read_text(encoding='utf-8'))
    assert result
    p.screenshot(path=str(out/'review-desktop.png'))
    p.locator('#reviewClose').click()
    p.reload();p.locator('#loadProject').set_input_files(str(out/'review.json'))
    p.wait_for_function('document.querySelector("#banner")?.textContent.includes("복원")')
    p.locator('#printReviewOpen').click();p.wait_for_function('document.querySelectorAll(".review-card").length===5')
    p.locator('[data-tool=select]').click()
    p.locator('.review-card-body').filter(has_text='행사 날짜 수정').click();assert p.locator('#reviewAttachments img').count()==1
    assert p.locator('#reviewInline').is_visible()
    p.set_viewport_size({'width':1024,'height':700});p.screenshot(path=str(out/'review-small.png'))
    assert p.locator('#reviewClose').is_visible()
    p.locator('#reviewClose').click();p.locator('[data-mode=poster]').click();p.locator('#printReviewOpen').click()
    assert p.locator('#reviewMarks > g').count()==0
    mark('box',.2,.1,.5,.25)
    p.locator('#reviewClose').click();p.locator('[data-mode=booklet]').click();p.locator('#printReviewOpen').click()
    assert p.locator('#reviewMarks > g').count()==0
    mark('pin',.2,.1,.2,.1);p.locator('#reviewSurface').select_option(index=1)
    assert p.locator('#reviewMarks > g').count()==0
    assert not errors,errors
    placement=p.evaluate('''async()=>{
      const {createReviewCards}=await import('./js/review-cards.js');
      const host=document.createElement('div');host.style.cssText='position:relative;width:900px;height:700px;flex:none';document.querySelector('#printReview').append(host);
      let rows=[],selected=null,saves=0;const cards=createReviewCards({sheet:host,getRows:()=>rows,getSurface:()=>({key:'test'}),getSelected:()=>selected,isVisible:()=>true,isSelecting:()=>true,choose:id=>{selected=id},save:()=>{saves++}});
      const results=[];
      for(const type of ['box','circle','underline','arrow','pin']){
        selected=null;rows=[{id:'other',surface:'test',type:'pin',x:.03,y:.03,x2:.03,y2:.03,color:'#d93c35',text:'다른 요청'},{id:'target',surface:'test',type,x:.72,y:.65,x2:type==='pin'?.72:.84,y2:type==='pin'||type==='underline'?.65:.75,color:'#d93c35',text:'이 위치 수정'}];
        cards.render();const card=host.querySelector('[data-id="target"]'),x=parseFloat(card.style.left),y=parseFloat(card.style.top),r=rows[1];
        const gap=Math.hypot(Math.max(180+r.x*540-x-card.offsetWidth,x-180-r.x2*540,0),Math.max(135+r.y*430-y-card.offsetHeight,y-135-r.y2*430,0));
        const outside=x+card.offsetWidth<=180||x>=720||y+card.offsetHeight<=135||y>=565;
        if(!outside||gap>180)throw Error(type+' is not in the nearest margin: '+JSON.stringify({x,y,gap}));
        card.querySelector('.review-card-body').click();if(saves)throw Error('Opening a card must not freeze its automatic position');
        selected=null;cards.render();const reopened=host.querySelector('[data-id="target"]');if(parseFloat(reopened.style.left)!==x||parseFloat(reopened.style.top)!==y)throw Error('Card jumped after editing');
        rows[1]={...rows[1],noteSpace:'board',noteX:.82,noteY:.3};cards.render();const manual=host.querySelector('[data-id="target"]');if(Math.abs(parseFloat(manual.style.left)-738)>1||Math.abs(parseFloat(manual.style.top)-210)>1)throw Error('Manual position changed');
        results.push(type);
      }
      host.remove();return results;
    }''')
    assert len(placement)==5
    p.evaluate('''async()=>{
      const {composeReviewPages}=await import('./js/review-export.js');const base=document.createElement('canvas');base.width=900;base.height=600;const ctx=base.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,900,600);
      const r={number:1,x:.4,y:.4,x2:.5,y2:.5,color:'#d93c35',text:'긴 수정 요청입니다. '.repeat(200),comments:[],attachments:[]};const pages=composeReviewPages(base,[r]);
      if(!pages.length)throw Error('No export pages');
      for(const c of pages){if(c.width!==1500||c.height!==1050)throw Error('Missing white margins');const q=c.getContext('2d');const white=q.getImageData(1,1,1,1).data;if(white[0]!==255||white[1]!==255)throw Error('Margin is not white');const original=q.getImageData(310,235,1,1).data;if(original[0]!==18||original[1]!==52||original[2]!==86)throw Error('Artwork moved or covered');}
    }''')
    browser.close()
server.shutdown()
print('PASS shapes, undo/redo, front/back isolation, comments, attachments, done/reopen, PNG/PDF, project round trip, poster/book isolation, small screen')
