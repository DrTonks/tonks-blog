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
