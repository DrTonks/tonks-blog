import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {readCommentManifest,verifyCommentBackend} from './comment-deployment.mjs';
const article={id:'a_test',slug:'test/post',version:'v1',blocks:[]};
test('manifest validates schema and rejects duplicate or draft articles',()=>{const root=mkdtempSync(join(tmpdir(),'comment-deploy-'));try{mkdirSync(join(root,'community'));const save=articles=>writeFileSync(join(root,'community/comment-manifest.json'),JSON.stringify({schema:1,articles}));save([article]);assert.equal(readCommentManifest(root).articles.length,1);save([article,article]);assert.throws(()=>readCommentManifest(root));save([{...article,draft:true}]);assert.throws(()=>readCommentManifest(root));}finally{rmSync(root,{recursive:true,force:true});}});
test('backend verification checks each article and rejects unavailable comments',async()=>{let count=0;await verifyCommentBackend({articles:[article,{...article,id:'a_other'}]},'https://blog.test',async url=>{assert.match(url.pathname,/^\/api\/blog\/community\/articles\/a_.*\/comments$/);count++;return {ok:true,json:async()=>({success:true})}});assert.equal(count,2);await assert.rejects(verifyCommentBackend({articles:[article]},'https://blog.test/',async()=>({ok:false,json:async()=>({success:false})})),/NOT been rolled back/);});
