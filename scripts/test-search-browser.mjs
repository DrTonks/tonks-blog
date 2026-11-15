import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH?pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const blog=process.argv[2]||'http://127.0.0.1:4338',home=process.argv[3]||'http://127.0.0.1:4340';
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={noJS:[],tools:[],normal:[]};
async function isolated(options={}){
 const context=await browser.newContext({viewport:{width:1280,height:900},...options});
 await context.route('**/*',r=>{
  const u=new URL(r.request().url());
  if(![blog,home].includes(u.origin)||/^\/(?:api|images\/random|music)(?:\/|$)/.test(u.pathname))return r.abort();
  return r.continue();
 });return context;
}
try{
 const noJS=await isolated({javaScriptEnabled:false});
 for(const origin of [home,blog]){
  const p=await noJS.newPage();await p.goto(origin,{waitUntil:'networkidle'});
  assert.equal(await p.locator('link[rel="canonical"]').count(),1);
  if(origin===home){assert.equal(await p.locator('#static-profile h1').textContent(),'DrTonks');assert.equal(await p.locator('#static-profile nav a').count(),5);}
  else assert.ok(await p.locator('.post-card__title').count()>0);
  assert.ok((await p.locator('body').innerText()).length>60);
  report.noJS.push({origin,bodyTextLength:(await p.locator('body').innerText()).length});
  await p.screenshot({path:origin===home?'.cache/search-home-nojs.png':'.cache/search-blog-nojs.png'});
 }
 await noJS.close();
 const normal=await isolated();
 for(const origin of [home,blog]){
  const p=await normal.newPage(),requests=[];p.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/agent/'))requests.push(r.url());});
  await p.goto(origin,{waitUntil:'networkidle'});await p.waitForTimeout(1800);
  assert.equal(requests.length,0,'Agent corpus must not be loaded on ordinary visits');
  if(origin===home){assert.equal(await p.locator('#static-profile').count(),0);await p.waitForFunction(()=>document.body.textContent.includes('将点滴的美好谱写成诗'),{},{timeout:20000});await p.waitForTimeout(1800);}
  report.normal.push({origin,eagerAgentRequests:requests.length});
  await p.screenshot({path:origin===home?'.cache/search-home-js.png':'.cache/search-blog-js.png'});
 }
 await normal.close();
 const agent=await isolated();
 // Test the tool contract even on Edge builds without the experimental API.
 // This is not a claim of native browser/agent compatibility certification.
 await agent.addInitScript(()=>{
  window.__agentTools={};window.__registrations=[];
  Object.defineProperty(document,'modelContext',{value:{registerTool(tool){window.__registrations.push(tool.name);window.__agentTools[tool.name]=tool;}},configurable:true});
 });
 for(const origin of [home,blog]){
  const p=await agent.newPage(),requests=[];p.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/agent/'))requests.push(r.url());});
  await p.goto(origin,{waitUntil:'networkidle'});
  await p.waitForFunction(()=>Object.keys(window.__agentTools).length===2);
  assert.equal(requests.length,0);
  if(origin===home){
   const result=await p.evaluate(async()=>JSON.parse(await window.__agentTools.tonks_find_destinations.execute({query:'相册'})));
   assert.equal(result[0].url,'https://blog.tonks.top/albums/');
  }else{
   const result=await p.evaluate(async()=>JSON.parse(await window.__agentTools.tonks_search_content.execute({kind:'article',limit:2})));
   assert.equal(result.results.length,2);
   const article=await p.evaluate(async id=>JSON.parse(await window.__agentTools.tonks_read_article.execute({id})),result.results[0].id);
   assert.ok(article.markdown.includes(result.results[0].url));
   const bad=await p.evaluate(async()=>JSON.parse(await window.__agentTools.tonks_read_article.execute({id:'../../.env'})));assert.ok(bad.error);
   const target=new URL(result.results[0].url).pathname;
   await p.evaluate(path=>{const a=document.createElement('a');a.href=path;document.body.append(a);a.click();a.remove();},target);
   await p.waitForURL(blog+target);
   // Swup can update history before the response/head replacement completes.
   // Wait for the observable result instead of assuming localhost latency.
   await p.waitForFunction(expected=>document.querySelector('link[rel="canonical"]')?.getAttribute('href')===expected,result.results[0].url,{timeout:30000});
   assert.equal(await p.locator('link[rel="canonical"]').getAttribute('href'),result.results[0].url);
   assert.equal(await p.evaluate(()=>window.__registrations.length),2,'Swup must not register duplicate tools');
   assert.equal(requests.length,2,'Only catalog and selected article are fetched');
  }
  report.tools.push({origin,names:await p.evaluate(()=>Object.keys(window.__agentTools)),requests:requests.length});
 }
 console.log(JSON.stringify(report));
}finally{await browser.close();}
