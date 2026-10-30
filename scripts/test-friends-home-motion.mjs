// Run against a local production preview, without concurrent CPU-heavy tests;
// external requests are isolated. The 85% gate ceiling is a timing smoke check.
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
import assert from 'node:assert/strict';

const origin=process.argv[2] || 'http://127.0.0.1:4339';
const browser=await chromium.launch({channel:'msedge',headless:true});
const output={navigation:[],friends:[]};
const click=async(p,href)=>p.evaluate(href=>{const a=document.createElement('a');a.href=href;document.body.append(a);a.click();a.remove();},href);
const settle=async p=>{await p.waitForTimeout(1500);assert.equal(await p.evaluate(()=>document.body.dataset.bannerNavigation),undefined);};
try {
 const context=await browser.newContext({viewport:{width:1536,height:864}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin&&!new URL(r.request().url()).pathname.startsWith('/api/')?r.continue():r.abort());
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const start of ['top','bottom']){
  await p.goto(origin+'/about/',{waitUntil:'networkidle'});await settle(p);
  await p.evaluate(start=>scrollTo({top:start==='top'?0:document.documentElement.scrollHeight,behavior:'instant'}),start);await p.waitForTimeout(150);
  await p.evaluate(()=>{window.motionSamples=[];const start=performance.now();const tick=()=>{const grid=document.getElementById('main-grid');const a=grid.getAnimations()[0];const l=document.getElementById('home-sticker-layer');window.motionSamples.push({t:performance.now()-start,top:grid.getBoundingClientRect().top,duration:a?.effect.getTiming().duration,progress:a?.currentTime,active:document.body.hasAttribute('data-banner-navigation'),sticker:l.classList.contains('is-layer-active'),pending:l.hasAttribute('data-reveal-pending'),paused:window.__tonksBannerPageTransitionPaused});if(performance.now()-start<1600)requestAnimationFrame(tick);};tick();});
  await click(p,'/');await p.waitForTimeout(1700);
  const samples=await p.evaluate(()=>window.motionSamples);
  const moving=samples.filter(s=>s.active&&s.duration);
  const first=moving[0];const revealed=moving.find(s=>s.sticker);
  assert.ok(first);assert.ok(revealed);assert.equal(first.sticker,false);
  assert.ok(revealed.progress/revealed.duration>=.69,'Stickers revealed too early');
  assert.ok(revealed.progress/revealed.duration<.85,'Stickers revealed too late');
  assert.ok(moving.every(s=>s.paused),'Carousel resumed before motion finished');
  assert.equal(samples.at(-1).pending,false);assert.equal(samples.at(-1).sticker,true);
  output.navigation.push({start,duration:first.duration,firstStickerProgress:revealed.progress/revealed.duration,last:samples.at(-1)});
 }
 assert.ok(output.navigation[1].duration>output.navigation[0].duration);
 assert.equal(output.navigation[0].duration,600);assert.ok(output.navigation[1].duration<=850);
 // Slow, uncached response: Swup aborts before entering. Its abort hook must
 // freeze the presentation, never snap it to the cancelled home's endpoint.
 const slow=await context.newPage();
 slow.on('pageerror',e=>errors.push(e.message));
 await slow.route(origin+'/',async route=>{await new Promise(r=>setTimeout(r,900));await route.continue().catch(()=>{});});
 await slow.goto(origin+'/about/',{waitUntil:'networkidle'});await settle(slow);
 await slow.evaluate(()=>{
  window.abortSamples=[];let before=0;
  window.swup.hooks.before('visit:abort',()=>{before=document.getElementById('main-grid').getBoundingClientRect().top;},{priority:-10000});
  window.swup.hooks.on('visit:abort',()=>window.abortSamples.push(Math.abs(document.getElementById('main-grid').getBoundingClientRect().top-before)),{priority:10000});
  scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
 });
 await click(slow,'/');await slow.waitForTimeout(120);await click(slow,'/friends/');await settle(slow);
 const abortDeltas=await slow.evaluate(()=>window.abortSamples);assert.ok(abortDeltas.length);assert.ok(abortDeltas.every(delta=>delta<3),JSON.stringify(abortDeltas));
 assert.equal(await slow.evaluate(()=>document.getElementById('home-sticker-layer').hasAttribute('data-reveal-pending')),false);
 output.abortDeltas=abortDeltas;await slow.close();
 // Reverse before release: no stale gate may show the home stickers on an inner page.
 await click(p,'/about/');await settle(p);await click(p,'/');await p.waitForTimeout(120);await click(p,'/friends/');await settle(p);
 assert.equal(await p.evaluate(()=>document.getElementById('home-sticker-layer').classList.contains('is-layer-active')),false);
 assert.equal(await p.evaluate(()=>document.getElementById('home-sticker-layer').hasAttribute('data-reveal-pending')),false);
 // User input, resizing, and reduced motion must finish rather than hide stickers indefinitely.
 for(const mode of ['wheel','resize','reduce']){
  await p.setViewportSize({width:1536,height:864});await p.emulateMedia({reducedMotion:'no-preference'});
  await p.goto(origin+'/about/',{waitUntil:'networkidle'});await settle(p);await p.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));await click(p,'/');await p.waitForTimeout(120);
  if(mode==='wheel')await p.mouse.wheel(0,160);
  if(mode==='resize')await p.setViewportSize({width:1280,height:900});
  if(mode==='reduce')await p.emulateMedia({reducedMotion:'reduce'});
  await settle(p);
  assert.equal(await p.evaluate(()=>document.getElementById('home-sticker-layer').hasAttribute('data-reveal-pending')),false,mode);
  assert.equal(await p.evaluate(()=>document.getElementById('home-sticker-layer').classList.contains('is-layer-active')),true,mode);
 }
 // The shared batch placement also serves replacement and resize.
 for(const width of [1536,390]){
  await p.emulateMedia({reducedMotion:'no-preference'});await p.setViewportSize({width,height:900});
  await p.goto(origin+'/',{waitUntil:'networkidle'});await settle(p);
  const active=p.locator('[data-home-sticker].is-active:not([hidden])');
  assert.equal(await active.count(),width<1024?1:2);
  const oldId=await active.first().getAttribute('data-sticker-id');
  await active.first().locator('.home-sticker__replace').click();await p.waitForTimeout(1400);
  assert.equal(await active.count(),width<1024?1:2);
  assert.notEqual(await active.first().getAttribute('data-sticker-id'),oldId);
  const fits=await active.evaluateAll(cards=>cards.every(card=>{const layer=document.getElementById('home-sticker-layer'),x=parseFloat(card.style.getPropertyValue('--sticker-x')),y=parseFloat(card.style.getPropertyValue('--sticker-y'));return Number.isFinite(x)&&Number.isFinite(y)&&x>=8&&x+card.offsetWidth<=layer.clientWidth-7&&y>=88;}));
  assert.ok(fits);
 }
 for(const width of [1280,390]){
  await p.emulateMedia({reducedMotion:'no-preference'});await p.setViewportSize({width,height:900});
  await p.goto(origin+'/friends/',{waitUntil:'networkidle'});await settle(p);
  const markers=p.locator('[data-friend-reveal]');assert.equal(await markers.count(),8);
  const pending=p.locator('[data-friend-reveal-state="pending"]').first();assert.ok(await pending.count());
  const el=await pending.elementHandle();
  await el.evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-innerHeight+65,behavior:'instant'}));await p.waitForTimeout(100);
  const timing=await el.evaluate(e=>e.getAnimations().map(a=>a.effect.getTiming().duration));assert.ok(timing.includes(500));await p.waitForTimeout(650);
  const next=p.locator('[data-friend-reveal-state="pending"]').first();
  if(await next.count()){const focusTarget=await next.elementHandle();await focusTarget.focus();assert.equal(await focusTarget.evaluate(e=>getComputedStyle(e).opacity),'1');}
  await p.evaluate(()=>dispatchEvent(new Event('beforeprint')));assert.equal(await p.locator('[data-friend-reveal-state="pending"]').count(),0);
  await p.evaluate(()=>dispatchEvent(new Event('afterprint')));
  for(let i=0;i<8;i++){await markers.nth(i).scrollIntoViewIfNeeded();await p.waitForTimeout(120);}
  await p.waitForTimeout(650);
  const card=markers.last();await p.mouse.move(0,0);await p.evaluate(()=>document.activeElement?.blur());await p.waitForTimeout(300);
  const restingPaper=await card.locator('.friend-sticker__paper').evaluate(e=>getComputedStyle(e).transform);
  await card.hover();await p.waitForTimeout(300);
  const paper=await card.locator('.friend-sticker__paper').evaluate(e=>getComputedStyle(e).transform);
  assert.notEqual(paper,restingPaper);assert.equal(paper,'matrix(1, 0, 0, 1, 0, 0)');
  await click(p,'/about/');await settle(p);await click(p,'/friends/');await settle(p);
  assert.equal(await p.locator('[data-friend-reveal-state="pending"]').count(),0);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  output.friends.push({width,count:8,timing,paper,pendingAfterReturn:0});
 }
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});const q=await nojs.newPage();await q.goto(origin+'/friends/');
 assert.equal(await q.locator('[data-friend-reveal]').count(),8);
 assert.ok((await q.locator('[data-friend-reveal]').evaluateAll(es=>es.map(e=>getComputedStyle(e).opacity))).every(o=>o==='1'));await nojs.close();
 assert.deepEqual(errors,[]);output.errors=errors;console.log(JSON.stringify(output,null,2));
}finally{await browser.close();}
