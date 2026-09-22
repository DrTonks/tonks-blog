import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const compiled = ts.transpileModule(readFileSync(new URL('../src/utils/friend-reading.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {pickFriendArticle,friendUpdateLabel,isRecentFriendArticle} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now=Date.UTC(2026,8,22);
const article=(feedUrl,ageDays)=>({feedUrl,url:`https://example.org/${feedUrl}`,title:feedUrl,summary:'',publishedAt:new Date(now-ageDays*86400000).toISOString()});
test('one latest entry per feed, reject invalid or future dates, exclude the current feed',()=>{
 const input=[article('a',0),article('a',1),article('b',6),article('future',-1),{...article('bad',0),publishedAt:'invalid'},{...article('url',0),url:'javascript:alert(1)'}];
 assert.equal(pickFriendArticle(input,'a',now,()=>0).feedUrl,'b');
 assert.equal(pickFriendArticle(input,undefined,now,()=>0).publishedAt,input[0].publishedAt);
 assert.equal(pickFriendArticle([],undefined,now),undefined);
 assert.equal(pickFriendArticle([input[0]],'a',now).feedUrl,'a');
});
test('exact seven-day boundary: exclude old articles, never fill the empty pool with old content',()=>{
 assert.equal(isRecentFriendArticle(article('old',7),now),false);
 assert.equal(isRecentFriendArticle(article('old',90),now),false);
 assert.equal(isRecentFriendArticle({...article('edge',7),publishedAt:new Date(now-7*86400000+1).toISOString()},now),true);
 assert.equal(pickFriendArticle([article('old',7),article('older',70)],undefined,now),undefined);
 assert.equal(pickFriendArticle([article('old',7),article('recent',1)],'recent',now).feedUrl,'recent');
});
test('newer articles have higher probability within the eligible week',()=>{
 let seed=23789;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
 const input=[article('a',0),article('b',3),article('c',6)];const counts={a:0,b:0,c:0};
 for(let i=0;i<70000;i++)counts[pickFriendArticle(input,undefined,now,random).feedUrl]++;
 const expected=2**(3/7);
 assert.ok(Math.abs(counts.a/counts.b-expected)<.08);assert.ok(Math.abs(counts.b/counts.c-expected)<.08);
});
test('relative update labels remain available for older friends',()=>{
 assert.equal(friendUpdateLabel(new Date(now-120000).toISOString(),now),'刚刚更新');
 assert.equal(friendUpdateLabel(new Date(now-20*86400000).toISOString(),now),'20 天前更新');
 assert.equal(friendUpdateLabel('invalid',now),'更新时间未知');
});
