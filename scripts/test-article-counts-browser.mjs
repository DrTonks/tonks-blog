// Production preview regression: card scripts must not be trapped in templates.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parse} from 'node-html-parser';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const origin=process.argv[2] || 'http://127.0.0.1:4338';
// Inspect every generated page, not just the first card's script name.
let checkedPages=0;
async function auditTemplates(dir){
 for(const item of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,item.name);
  if(item.isDirectory())await auditTemplates(path);
  else if(item.name.endsWith('.html')){
   checkedPages++;
   const html=parse(await readFile(path,'utf8'));
   for(const template of html.querySelectorAll('template')){
    const scripts=template.querySelectorAll('script').filter(s=>!['application/json','application/ld+json'].includes(s.getAttribute('type')));
    assert.equal(scripts.length,0,`Executable script trapped in template: ${path}`);
   }
  }
 }
}
await auditTemplates('dist');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 let zeroId;const requests=[],errors=[],writes=[],votes=[];const liked=new Set();
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!==origin)return route.abort();
  const match=u.pathname.match(/^\/api\/blog\/community\/articles\/([^/]+)\/comments$/);
  if(match){requests.push(match[1]);return route.fulfill({json:{success:true,count:match[1]===zeroId?0:4,comments:[],counts:{}}});}
  if(u.pathname==='/api/blog/views')return route.fulfill({json:{success:true,views:Object.fromEntries(u.searchParams.getAll('slugs').map(s=>[s,123]))}});
  if(u.pathname==='/api/blog/community/likes')return route.fulfill({json:{success:true,likes:Object.fromEntries(u.searchParams.getAll('targets').map(t=>[t,{count:liked.has(t)?8:7,liked:liked.has(t)}]))}});
  if(u.pathname.startsWith('/api/blog/community/likes/')&&route.request().method()==='POST'){
   const target=decodeURIComponent(u.pathname.slice('/api/blog/community/likes/'.length));writes.push(target);
   if(liked.has(target))liked.delete(target);else liked.add(target);
   return route.fulfill({json:{success:true,target,count:liked.has(target)?8:7,liked:liked.has(target)}});
  }
  if(u.pathname.startsWith('/api/blog/community/polls/')){
   if(route.request().method()==='POST'){
    const {option}=route.request().postDataJSON();votes.push(u.pathname);
    return route.fulfill({json:{success:true,voted:true,choice:option,total:3,counts:{[option]:3}}});
   }
   return route.fulfill({json:{success:true,voted:false}});
  }
  if(u.pathname.startsWith('/api/'))return route.abort();
  return route.continue();
 });
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 const verifyCard=async card=>{
  await card.scrollIntoViewIfNeeded();
  await p.waitForFunction(()=>[...document.querySelectorAll('.post-card')].every(c=>c.querySelector('[data-blog-views]')?.textContent==='123 浏览'&&c.querySelector('[data-community-like]')?.dataset.communityBound==='true'));
  const like=card.locator('[data-community-like]');
  const pressed=await like.locator('button').getAttribute('aria-pressed');
  const before=writes.length;
  await like.locator('button').click();
  await p.waitForFunction(()=>[...document.querySelectorAll('.community-like__button')].every(b=>!b.disabled));
  assert.equal(writes.length,before+1,'Missing or duplicate like handler');
  assert.equal(await like.locator('button').getAttribute('aria-pressed'),String(pressed!=='true'));
  assert.equal(await like.locator('[data-like-count]').textContent(),pressed==='true'?'7':'8');
  const missing=await card.evaluate(c=>[...c.querySelectorAll('use')].map(e=>e.getAttribute('href')||e.getAttribute('xlink:href')).filter(h=>h?.startsWith('#')&&!document.getElementById(h.slice(1))));
  assert.deepEqual(missing,[],'SVG icon definition is trapped in template');
 };
 await p.goto(origin+'/',{waitUntil:'networkidle'});
 const first=p.locator('.post-card [data-article-count]').first();
 await first.locator('..').scrollIntoViewIfNeeded();
 await p.waitForFunction(()=>{const e=document.querySelector('.post-card [data-article-count]');return e&&!e.hidden&&e.querySelector('span').textContent==='4';});
 assert.ok(requests.length>0,'No count requests on direct homepage load');
 await verifyCard(p.locator('.post-card').first());
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('template')].some(t=>t.content.querySelector('script[src*="PostCard.astro"]'))),false);
 zeroId=await p.locator('.post-card [data-article-count]').nth(1).getAttribute('data-article-count');
 await p.reload({waitUntil:'networkidle'});
 const zero=p.locator(`.post-card [data-article-count="${zeroId}"]`);
 await zero.locator('..').scrollIntoViewIfNeeded();
 await p.waitForFunction(id=>document.querySelector(`[data-article-count="${id}"] span`)?.textContent==='0',zeroId);
 assert.equal(await zero.getAttribute('hidden'),'');
 // Widen from the static eight-card list into the responsive twelve-card pool.
 await p.setViewportSize({width:2560,height:1000});
 await p.evaluate(()=>{localStorage.setItem('postListLayout','grid');});
 await p.reload({waitUntil:'networkidle'});
 await p.waitForFunction(()=>document.querySelector('[data-post-list-root]')?.dataset.pageSize==='12');
 const visibleCounters=p.locator('.post-card [data-article-count]');
 const last=visibleCounters.last();const lastId=await last.getAttribute('data-article-count');
 await last.locator('..').scrollIntoViewIfNeeded();
 await p.waitForFunction(id=>{const e=document.querySelector(`.post-card [data-article-count="${id}"]`);return e&&!e.hidden&&e.querySelector('span').textContent==='4';},lastId);
 await verifyCard(p.locator('.post-card').last());
 const overflowIndex=await p.evaluate(()=>[...document.querySelectorAll('.post-card')].find(c=>{const v=c.querySelector('.post-card__title-viewport');return v.scrollWidth>v.clientWidth+1;})?.dataset.postIndex);
 assert.ok(overflowIndex,'Fixture must include a truncated title');
 const overflow=p.locator(`.post-card[data-post-index="${overflowIndex}"]`);
 await overflow.scrollIntoViewIfNeeded();await overflow.hover();
 await p.waitForFunction(i=>document.querySelector(`.post-card[data-post-index="${i}"] .post-card__title`)?.dataset.titleReveal==='auto',overflowIndex);
 await p.mouse.move(0,0);
 // Move initialized nodes back into the pool and then restore them.
 for(const layout of ['list','grid']){
  await p.evaluate(layout=>{localStorage.setItem('postListLayout',layout);window.dispatchEvent(new CustomEvent('layoutChange',{detail:{layout}}));},layout);
  await p.waitForFunction(size=>document.querySelector('[data-post-list-root]')?.dataset.pageSize===size,layout==='list'?'8':'12');
  await p.waitForTimeout(800);
 }
 await verifyCard(p.locator('.post-card').last());
 const click=href=>p.evaluate(href=>{const a=document.createElement('a');a.href=href;document.body.append(a);a.click();a.remove();},href);
 await click('/friends/');await p.waitForURL('**/friends/');await p.waitForTimeout(1200);
 await click('/');await p.waitForURL(origin+'/');await p.waitForTimeout(1200);
 await p.locator('.post-card').first().scrollIntoViewIfNeeded();
 await p.waitForFunction(()=>{const e=document.querySelector('.post-card [data-article-count]');return e&&!e.hidden&&e.querySelector('span').textContent==='4';});
 await verifyCard(p.locator('.post-card').first());
 await p.locator('[data-post-pagination] a[aria-label="第 2 页"]').click();
 await p.waitForURL('**/2/**');await p.waitForTimeout(1200);
 await verifyCard(p.locator('.post-card').first());
 await p.waitForFunction(()=>{const e=document.querySelector('.post-card [data-article-count]');return e&&!e.hidden;});
 await click('/archive/');await p.waitForURL('**/archive/');await p.waitForTimeout(1200);
 await p.locator('.archive-entry').first().scrollIntoViewIfNeeded();
 await p.waitForFunction(()=>[...document.querySelectorAll('.archive-entry [data-article-count]')].some(e=>!e.hidden&&e.textContent.includes('4')));
 // Page scripts must also initialize when first reached through Swup.
 await click('/posts/airespect/do-ai-need-thanks/');await p.waitForURL('**/posts/airespect/do-ai-need-thanks/');await p.waitForTimeout(1200);
 await p.waitForFunction(()=>document.querySelector('[data-article-comments]')?.dataset.ready==='true');
 const poll=p.locator('.article-poll').first();await poll.scrollIntoViewIfNeeded();
 await p.waitForFunction(()=>document.querySelector('.article-poll')?.dataset.pollVoted==='false');
 assert.equal(await poll.locator('input[type="radio"]').first().isDisabled(),false);
 await poll.locator('input[type="radio"]').first().check();await poll.locator('.poll-submit').click();
 await p.waitForFunction(()=>document.querySelector('.article-poll')?.dataset.pollVoted==='true');
 assert.equal(votes.length,1);assert.equal(await poll.locator('input[type="radio"]').first().isDisabled(),true);
 assert.ok((await poll.locator('.poll-result').first().textContent()).includes('100%'));
 await p.setViewportSize({width:390,height:844});
 await p.goto(origin+'/',{waitUntil:'networkidle'});
 await verifyCard(p.locator('.post-card').first());
 await p.waitForFunction(()=>{const e=document.querySelector('.post-card [data-article-count]');return e&&!e.hidden&&e.textContent.includes('4');});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checkedPages,directLoad:true,zeroHidden:true,poolCardVisible:true,swupReturn:true,likesAndViews:true,likeWrites:writes.length,titleHover:true,pagination:true,archive:true,articleComments:true,poll:true,pollWrites:votes.length,mobile:true,requests:requests.length,errors}));
}finally{await browser.close();}
