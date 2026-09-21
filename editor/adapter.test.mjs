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
