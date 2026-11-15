import test from 'node:test';
import assert from 'node:assert/strict';
import {publicArticle,publicMarkdown,safePublicUrl} from './public-markdown.mjs';
import {searchCatalog,articlePath,createBlogTools} from '../src/utils/agent-tools.mjs';
import {canonicalUrl,isIndexable} from '../src/utils/search-policy.mjs';
const options={canonical:'https://blog.tonks.top/posts/example/',title:'Example'};
test('public export is explicit and excludes private/draft content',()=>{
 assert.equal(publicArticle({draft:true}),false);assert.equal(publicArticle({encrypted:true}),false);assert.equal(publicArticle({draft:false,encrypted:false}),true);
 const source='---\npassword: SECRET_FRONTMATTER\n---\n# Public\n\n<!-- SECRET_COMMENT -->\n\n:::poll{id="q" title="Question" answer="SECRET_ANSWER" explanation="SECRET_REASON"}\n- [a] A\n- [b] B\n:::\n\n**Visible** and ~~old~~.\n\n<div data-secret="SECRET_HTML">HTML</div>\n';
 const result=publicMarkdown(source,options);
 assert.ok(!result.markdown.includes('SECRET'));assert.ok(result.markdown.includes('Visible'));assert.ok(result.markdown.includes('~~old~~'));assert.ok(result.markdown.includes('原文'));assert.ok(result.markdown.includes('请到原文参与'));
});
test('references and images never manufacture source asset URLs or execute protocols',()=>{
 const source='[x](javascript:alert) ![local](./secret.png) [ref][r]\n\n[r]: data:text/html,bad\n\n![public](/images/a.png) [section](#one)';
 const {markdown}=publicMarkdown(source,options);
 assert.ok(!markdown.includes('javascript:'));assert.ok(!markdown.includes('data:text'));assert.ok(!markdown.includes('secret.png'));assert.ok(markdown.includes('https://blog.tonks.top/images/a.png'));assert.ok(markdown.includes('https://blog.tonks.top/posts/example/#one'));
 assert.equal(safePublicUrl('file:///C:/private',options.canonical),null);
});
test('preserves tables, math and code as readable Markdown',()=>{
 const {markdown}=publicMarkdown('a | b\n--|--\n1|2\n\n$x^2$\n\n```mermaid\ngraph LR\nA-->B\n```',options);
 assert.match(markdown,/\| a/);assert.match(markdown,/\$x\^2\$/);assert.match(markdown,/```mermaid/);
});
const catalog={schemaVersion:1,articles:[{id:'a',kind:'article',title:'AI agents',description:'Example',text:'原文全文测试',tags:[],url:options.canonical,markdownUrl:'https://blog.tonks.top/agent/articles/a.md'}],projects:[],albums:[]};
test('search validates ranges, supports full text, strips index-only payload',()=>{
 assert.equal(searchCatalog(catalog,{query:'全文'}).total,1);assert.equal(searchCatalog(catalog,{query:'absent'}).total,0);
 assert.equal(searchCatalog(catalog,{}).results[0].text,undefined);
 for(const args of [{limit:999},{offset:-1},{kind:'admin'},{query:[]},{query:'a'.repeat(161)},{secret:true}])assert.throws(()=>searchCatalog(catalog,args));
 assert.equal(articlePath(catalog,{id:'a'}),'/agent/articles/a.md');assert.throws(()=>articlePath(catalog,{id:'../secret'}));assert.throws(()=>articlePath({...catalog,articles:[{...catalog.articles[0],markdownUrl:'https://evil.invalid/a.md'}]},{id:'a'}));
});
test('tools are lazy, share pending catalog and recover after failure',async()=>{
 let calls=0;const tools=createBlogTools(async path=>{calls++;return new Response(path.endsWith('.json')?JSON.stringify(catalog):'# body',{headers:{'Content-Type':path.endsWith('.json')?'application/json':'text/markdown'}});});
 assert.equal(calls,0);await Promise.all([tools[0].execute({query:'AI'}),tools[0].execute({})]);assert.equal(calls,1);
 const result=JSON.parse(await tools[1].execute({id:'a'}));assert.equal(calls,2);assert.equal(result.markdown,'# body');
 await tools[1].execute({id:'../../private'});assert.equal(calls,2);
 let fail=true;const retry=createBlogTools(async()=>{if(fail)throw new Error('offline');return new Response(JSON.stringify(catalog),{headers:{'Content-Type':'application/json'}});});
 assert.ok(JSON.parse(await retry[0].execute({})).error);fail=false;assert.equal(JSON.parse(await retry[0].execute({})).total,1);
});

test('invalid read arguments fail before downloading the catalog',async()=>{
 let calls=0;
 const tools=createBlogTools(async()=>{calls++;return new Response(JSON.stringify(catalog),{headers:{'Content-Type':'application/json'}});});
 for(const args of [null,[],{}, {id:[]},{id:'a',extra:true},{id:'a'.repeat(501)}]){
  assert.ok(JSON.parse(await tools[1].execute(args)).error);
 }
 assert.equal(calls,0);
 // A well-formed but unknown ID still needs the public catalog to verify it.
 assert.ok(JSON.parse(await tools[1].execute({id:'unknown'})).error);
 assert.equal(calls,1);
});
test('canonical and sitemap policy remove parameters and utility pages',()=>{
 assert.equal(canonicalUrl('https://blog.tonks.top/posts/example/?utm_source=x#part'),options.canonical);
 assert.equal(isIndexable('/font-test/'),false);assert.equal(isIndexable('/construction/'),false);assert.equal(isIndexable('/agent/index.json'),false);assert.equal(isIndexable('/posts/example/'),true);
});
