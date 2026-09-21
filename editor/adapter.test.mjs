import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {renderMarkdown}=createRequire(import.meta.url)('./dist/adapter.cjs');
test('blog preview uses blog directives and strips executable article markup',async()=>{
 const {html}=await renderMarkdown(':::quote{author="作者"}\n正文\n:::\n\n:::spoiler\n隐藏\n:::\n\n<script>alert(1)</script>');
 assert.match(html,/article-quote/);assert.match(html,/spoiler-content/);assert.doesNotMatch(html,/<script/);
});
test('editor config has unique format identifiers and usable theme list',()=>{const c=JSON.parse(fs.readFileSync(new URL('./blog-editor.json',import.meta.url)));assert.equal(c.schemaVersion,1);assert.equal(new Set(c.formats.map(f=>f.id)).size,c.formats.length);assert.equal(c.themes.length,4);});

test('GFM deletion survives sanitization including nested emphasis and links',async()=>{
 const {html}=await renderMarkdown('~~已删除 **强调** [链接](https://example.com)~~\n\n<del onclick="alert(1)">旧内容</del>');
 assert.match(html,/<del>已删除 <strong>强调<\/strong> <a href="https:\/\/example.com" data-external-link="true">链接<\/a><\/del>/);
 assert.match(html,/<del>旧内容<\/del>/);
 assert.doesNotMatch(html,/onclick/);
});

test('external text links are marked without changing internal, mail, or image links',async()=>{
 const {html}=await renderMarkdown('[外链](https://example.com) [本站](https://blog.tonks.top/posts/a/) [相对](/posts/a/) [邮箱](mailto:test@example.com) [![图片](https://example.com/a.png)](https://example.com)');
 assert.equal((html.match(/data-external-link="true"/g)||[]).length,1);
 assert.match(html,/<a href="https:\/\/example.com" data-external-link="true">外链<\/a>/);
});

test('live blocks map to exact source after frontmatter, including wrapped tables and directives',async()=>{
 const text='\uFEFF---\r\ntitle: Live\r\n---\r\n\r\n正文[^a]\r\n\r\n:::quote{author="作者"}\r\n引用\r\n:::\r\n\r\n| a | b |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\n[^a]: 注解';
 const {html}=await renderMarkdown(text,{sourceMap:true});
 const ranges=[...html.matchAll(/data-preview-from="(\d+)" data-preview-to="(\d+)"/g)].map(m=>text.slice(Number(m[1]),Number(m[2])));
 assert.equal(ranges[0],'正文[^a]');assert.ok(ranges.includes(':::quote{author="作者"}\r\n引用\r\n:::'));assert.ok(ranges.some(t=>t.startsWith('| a | b |')));
 assert.equal(ranges.length,3);assert.doesNotMatch((await renderMarkdown(text)).html,/data-preview-from/);
});

test('display math keeps exact source ranges after KaTeX replaces the root',async()=>{
 for(const body of ['$$\nx^2\n$$','```math\nx^2\n```','$$\n\\invalidcommand\n$$']){
  const text='---\ntitle: Math\n---\n\n'+body;
  const {html}=await renderMarkdown(text,{sourceMap:true});
  const ranges=[...html.matchAll(/data-preview-from="(\d+)" data-preview-to="(\d+)"/g)];
  assert.equal(ranges.length,1);assert.equal(text.slice(Number(ranges[0][1]),Number(ranges[0][2])),body);
  assert.match(html,/katex/);
  assert.doesNotMatch((await renderMarkdown(text)).html,/data-preview-from/);
 }
});
