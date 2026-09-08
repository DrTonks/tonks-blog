// Local browser regression: real comment UI, native fetch, isolated mock data.
// PLAYWRIGHT_MODULE_PATH may point to a host-provided Playwright installation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const astroRequire = createRequire(require.resolve('astro'));
const { build, transform: transformJs } = createRequire(astroRequire.resolve('vite'))('esbuild');
const { transform: transformAstro } = astroRequire('@astrojs/compiler');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const sourcePath = new URL('../src/utils/blog-community.ts', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const compiled = await build({stdin:{contents:source, resolveDir:fileURLToPath(new URL('../src/utils/', import.meta.url)),loader:'ts'}, bundle:true,write:false,format:'esm',loader:{'.css':'empty'},define:{'import.meta.env':'{}'}});
const layout = await readFile(new URL('../src/layouts/Layout.astro', import.meta.url), 'utf8');
const astro = await transformAstro(layout, {filename:'Layout.astro'});
const clarity = astro.scripts.find(script => script.code?.includes('type ClarityApi'));
assert(clarity && clarity.type === 'inline', 'Clarity must be extracted for Astro processing, not emitted as raw inline TypeScript');
const clarityJs = (await transformJs(clarity.code, {loader:'ts',format:'esm'})).code;
const base = {page:'about',website:'',created_at:'2026-09-08T00:00:00Z',status:'published',author_key:'fixture',owned:false,is_admin:false,reply_to_name:'',is_pinned:false};
const comments = [
  {...base,id:1,root_id:1,parent_id:null,nickname:'Root',content:'Older root'},
  {...base,id:2,root_id:1,parent_id:1,nickname:'Reply',content:'A reply'},
  {...base,id:19,root_id:19,parent_id:null,nickname:'Recent',content:'Recent root'},
];
const patches = [];
const fixture = '<!doctype html><html><head><meta charset="utf-8"></head><body><section data-community-comments="about"><form data-comment-form><input name="nickname"><input name="email"><input name="website"><textarea name="content"></textarea><button type="submit">发送</button></form><div data-comment-list></div></section><script type="module" src="/app.js"></script></body></html>';
const server = createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  const json = (status,body) => {res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if (url.pathname === '/app.js') {res.setHeader('Content-Type','text/javascript');return res.end(compiled.outputFiles[0].text);}
  if (url.pathname === '/clarity.js') {res.setHeader('Content-Type','text/javascript');return res.end(clarityJs);}
  if (url.pathname === '/api/calendar/events') return json(200,{success:true});
  if (url.pathname === '/api/blog/community/comments/about') return json(200,{success:true,comments,count:comments.length});
  if (/^\/api\/blog\/community\/comments\/\d+\/pin$/.test(url.pathname) && req.method === 'PATCH') {
    let body='';for await(const chunk of req)body+=chunk;
    const payload=JSON.parse(body);const type=req.headers['content-type'] || '';
    patches.push({type,secret:req.headers['x-admin-secret'],payload});
    if(req.headers['x-admin-secret'] !== 'local-test-secret')return json(401,{success:false});
    if(!type.startsWith('application/json') || typeof payload.is_pinned !== 'boolean')return json(400,{success:false,code:'invalid_pin'});
    comments.find(c=>c.id===Number(url.pathname.split('/').at(-2))).is_pinned=payload.is_pinned;
    return json(200,{success:true});
  }
  if (url.pathname === '/emojis/manifest.json')return json(200,{groups:[]});
  if (url.pathname === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
  res.writeHead(404);res.end();
});
let browser;
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(10000);
  const errors=[], alerts=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('admin_secret','local-test-secret'));
  const comment=id=>page.locator(`[data-comment-id="${id}"]`);
  const button=(id,pinned)=>comment(id).getByRole('button',{name:pinned?'取消置顶':'置顶',exact:true});
  await page.goto(origin);
  await button(19,false).waitFor();
  // Native fetch reproduces the original request exactly, without touching production.
  const original=await page.evaluate(async()=>{
    const res=await fetch('/api/blog/community/comments/19/pin',{method:'PATCH',headers:{'X-Admin-Secret':'local-test-secret'},body:JSON.stringify({is_pinned:true})});
    return {status:res.status,body:await res.json()};
  });
  assert.equal(original.status,400);assert.equal(original.body.code,'invalid_pin');
  assert(patches[0].type.startsWith('text/plain'));
  const order=()=>page.locator('[data-comment-list] > [data-comment-id]').evaluateAll(items=>items.map(e=>Number(e.dataset.commentId)));
  for (const id of [19,2]) {
    await button(id,false).click();await button(id,true).waitFor();
    assert.equal((await order())[0],id);
    assert.equal(await comment(id).count(),1,'pinned reply must not duplicate');
    await page.reload();await button(id,true).waitFor();assert.equal((await order())[0],id);
    await button(id,true).click();await button(id,false).waitFor();
    await page.reload();await button(id,false).waitFor();
    assert.deepEqual(await order(),[1,19]);
  }
  assert.equal(patches.length,5);
  assert.deepEqual(patches.slice(1).map(p=>p.payload.is_pinned),[true,false,true,false]);
  for(const patch of patches.slice(1)){assert.equal(patch.type,'application/json');assert.equal(patch.secret,'local-test-secret');}
  await page.addScriptTag({url:origin+'/clarity.js',type:'module'});
  await page.waitForFunction(()=>typeof window.clarity==='function');
  await page.evaluate(()=>window.clarity('event','local-regression'));
  assert.deepEqual(await page.evaluate(()=>window.clarity.q),[['event','local-regression']]);
  await page.addScriptTag({url:origin+'/clarity.js?navigation=2',type:'module'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  assert.equal(await page.locator('script[src^="https://www.clarity.ms/tag/"]').count(),1,'navigation must not load Clarity twice');
  assert.deepEqual(errors,[]);assert.deepEqual(alerts,[]);
  console.log('PASS: old native-fetch request reproduces 400; actual UI pins/unpins roots and replies; reload preserves state; JSON and admin headers; Clarity compiles and executes without syntax errors.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
