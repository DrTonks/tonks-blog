import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'node-html-parser';
import {annotateCommentBlocks} from '../src/utils/article-comment-map.mjs';
const map=html=>annotateCommentBlocks(parse(html),'example');
test('insertions and moves preserve unchanged paragraph identity',()=>{
  const old=map('<p>甲段</p><p>乙段</p>');
  const next=map('<p>新增</p><p>乙段</p><p>甲段</p>');
  for(const block of old.blocks)assert.equal(next.blocks.find(b=>b.text===block.text).id,block.id);
  assert.notEqual(old.version,next.version);
});
test('edited meaning gets a new identity rather than moving old comments',()=>{
  assert.notEqual(map('<p>推荐</p>').blocks[0].id,map('<p>不推荐</p>').blocks[0].id);
});
test('footnote renumbering does not change prose identity or leak markers into quotes',()=>{
  const plain=map('<p>正文</p>');
  const footnote=map('<p>正文<sup><a data-footnote-ref href="#note">2</a></sup></p>');
  assert.deepEqual(plain.blocks,footnote.blocks);
});
test('duplicate paragraphs have distinct context, rich content stays excluded',()=>{
  const result=map('<p>甲</p><p>相同</p><p>乙</p><p>相同</p><p>丙</p><figure><p>图片说明</p></figure><div class="spoiler"><p>隐藏文字</p></div><p><img src="a.png">图片</p>');
  assert.equal(new Set(result.blocks.map(b=>b.id)).size,5);
  assert.equal(result.blocks.length,5);
});
