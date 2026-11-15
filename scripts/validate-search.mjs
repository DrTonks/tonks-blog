import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {BLOG_ORIGIN,canonicalUrl,isIndexable} from '../src/utils/search-policy.mjs';

export function validateSearch(root){
 const read=name=>fs.readFileSync(path.join(root,name),'utf8');
 const llms=read('llms.txt'),raw=read('agent/index.json'),catalog=JSON.parse(raw);
 assert.equal(catalog.schemaVersion,1);assert.equal(catalog.site,BLOG_ORIGIN+'/');
 assert.ok(Buffer.byteLength(raw)<=2_000_000,'Agent catalog exceeds 2 MB; implement shards before adding more content');
 const files=[];
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else files.push(path.relative(root,full).replaceAll('\\','/'));}}
 walk(path.join(root,'agent/articles'));
 const expected=new Set(),ids=new Set();
 for(const a of catalog.articles){
  assert.equal(a.kind,'article');assert.ok(!ids.has(a.id),'Duplicate public article');ids.add(a.id);
  assert.equal(a.url,`${BLOG_ORIGIN}/posts/${a.id}/`);assert.equal(a.url,canonicalUrl(a.url));
  assert.equal(a.markdownUrl,`${BLOG_ORIGIN}/agent/articles/${a.id}.md`);
  const key=`agent/articles/${a.id}.md`;
  assert.equal(path.posix.normalize(key),key);assert.ok(!key.includes('\\'));expected.add(key);
  const markdown=read(key);assert.ok(markdown.includes(a.url));assert.ok(Buffer.byteLength(markdown)<=200_000,'Article exceeds 200 KB tool limit');
  assert.ok(llms.includes(a.markdownUrl));
  const html=parse(read(`posts/${a.id}/index.html`));
  assert.equal(html.querySelectorAll('link[rel="canonical"]').length,1);
  assert.equal(html.querySelector('link[rel="canonical"]').getAttribute('href'),a.url);
  assert.equal(html.querySelector('link[type="text/markdown"]').getAttribute('href'),`/agent/articles/${a.id}.md`);
  const ld=JSON.parse(html.querySelector('script[type="application/ld+json"]').textContent);
  assert.equal(ld['@type'],'BlogPosting');
  if(ld.image?.startsWith(BLOG_ORIGIN+'/'))assert.ok(fs.existsSync(path.join(root,decodeURIComponent(new URL(ld.image).pathname))),'Structured image must exist');
 }
 assert.deepEqual(new Set(files),expected,'Unexpected or stale Markdown exports');
 const sitemap=read('sitemap-0.xml');
 for(const match of sitemap.matchAll(/<loc>(.*?)<\/loc>/g))assert.ok(isIndexable(match[1]),`Utility page in sitemap: ${match[1]}`);
 assert.match(read('font-test/index.html'),/name="robots" content="noindex, follow"/);
 assert.match(read('robots.txt'),/Sitemap: https:\/\/blog\.tonks\.top\/sitemap-index\.xml/);
 console.log(`[search-check] ${ids.size} public articles, ${catalog.projects.length} projects, ${catalog.albums.length} albums; canonical, Markdown, sitemap and size budgets verified.`);
 return {articles:ids.size,catalogBytes:Buffer.byteLength(raw)};
}
