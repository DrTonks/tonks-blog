// Read-only smoke check. Run after an explicitly approved release, or against
// a local server implementing production MIME and missing-file behavior.
import assert from 'node:assert/strict';
const origin=process.argv[2];
const mode=process.argv[3];
if(!origin||!['blog','home'].includes(mode))throw new Error('Usage: node scripts/check-search-http.mjs https://site.example blog|home');
async function read(path,type){
 const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(15000),cache:'no-store'});
 assert.equal(response.status,200,`${path}: status`);assert.ok(response.headers.get('content-type')?.includes(type),`${path}: MIME`);
 return response.text();
}
assert.match(await read('/robots.txt','text/plain'),/User-agent: \*/);
assert.match(await read('/llms.txt','text/plain'),/^# /);
if(mode==='home'){
 assert.match(await read('/sitemap.xml','xml'),/<urlset/);
 assert.match(await read('/','text/html'),/id="static-profile"/);
 assert.equal(JSON.parse(await read('/agent/site.json','application/json')).schemaVersion,1);
 await read('/index.md','text/markdown');
}else{
 assert.match(await read('/sitemap-index.xml','xml'),/<sitemapindex/);
 const catalog=JSON.parse(await read('/agent/index.json','application/json'));assert.equal(catalog.schemaVersion,1);
 assert.ok(catalog.articles.length>0);const first=catalog.articles[0];
 assert.ok((await read(new URL(first.markdownUrl).pathname,'text/markdown')).includes(first.url));
}
const missing=await fetch(new URL('/__tonks_search_missing__.txt',origin),{signal:AbortSignal.timeout(15000)});
assert.equal(missing.status,404,'Unknown resources must not return SPA HTML with HTTP 200');
console.log(`[search-http] PASS ${mode} ${origin}`);
