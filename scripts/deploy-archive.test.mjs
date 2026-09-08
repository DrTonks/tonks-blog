import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { parseDeployArgs, validateSiteDir, validateArchiveKey, createArchive, publishArchive, localPython, runRemote } from './deploy-archive.mjs';

test('explicit read-only flags and invalid flags cannot silently deploy',()=>{
  assert.equal(parseDeployArgs([]),'deploy');
  for(const [flag,action] of [['--check','check'],['--status','status'],['--recover','recover'],['--rollback','rollback'],['--pack-only','pack']]) assert.equal(parseDeployArgs([flag]),action);
  for(const args of [['--deploy'],['--check','--rollback'],['--unknown']])assert.throws(()=>parseDeployArgs(args));
});
test('rejects broad remote roots and traversal/control/reserved archive paths',()=>{
  for(const dir of ['/','/var','/var/www','/var/www/blog/','/var/www/../blog','/var/www/blog;echo','relative'])assert.throws(()=>validateSiteDir(dir));
  assert.equal(validateSiteDir('/var/www/blog'),'/var/www/blog');
  for(const key of ['../x','a/../x','a\\b','a//b','/x','a\0b','a:b','.tonks-deploy-release.json'])assert.throws(()=>validateArchiveKey(key));
  assert.equal(validateArchiveKey('文章/空 格.txt'),'文章/空 格.txt');
});
test('archive preserves UTF-8/spaces/dash names and manifests exact files',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tonks-blog-fixture-'));
  let result;
  try {
    const data={'index.html':'<html>new</html>','version.json':'{"id":"test-version"}','.htaccess':'Options -Indexes','community/articles.json':'[]','文章/空 格.txt':'中文','--help':'literal'};
    const files=Object.entries(data).map(([key,content])=>{const localPath=path.join(root,key);fs.mkdirSync(path.dirname(localPath),{recursive:true});fs.writeFileSync(localPath,content);return {key,localPath};});
    result=await createArchive(root,files);
    assert.equal(result.manifest.files.length,6);
    assert.equal(result.manifest.totalBytes,Object.values(data).reduce((n,s)=>n+Buffer.byteLength(s),0));
    assert.match(result.archiveSha256,/^[0-9a-f]{64}$/);
    const listing=spawnSync(localPython,['-c','import json,sys,tarfile; print(json.dumps(tarfile.open(sys.argv[1]).getnames()))',result.archivePath],{encoding:'utf8',windowsHide:true});
    assert.equal(listing.status,0,listing.stderr);
    assert.deepEqual(JSON.parse(listing.stdout).sort(),Object.keys(data).sort());
    const contents=spawnSync(localPython,['-c','import json,sys,tarfile,hashlib; t=tarfile.open(sys.argv[1]); print(json.dumps([{ "path":m.name,"size":m.size,"sha256":hashlib.sha256(t.extractfile(m).read()).hexdigest()} for m in t]))',result.archivePath],{encoding:'utf8',windowsHide:true});
    assert.equal(contents.status,0,contents.stderr);
    assert.deepEqual(JSON.parse(contents.stdout),result.manifest.files);
    for(const entry of result.manifest.files)assert.equal(entry.sha256,createHash('sha256').update(data[entry.path]).digest('hex'));
    await assert.rejects(createArchive(root,files.filter(f=>f.key!=='.htaccess')),/requires .htaccess/);
    await assert.rejects(createArchive(root,[...files,files[0]]),/Duplicate/);
    await assert.rejects(createArchive(root,files.map((f,i)=>i===0?{...f,localPath:os.tmpdir()}:f)),/escapes dist/);
  } finally {
    result?.cleanup();
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    fs.rmSync(root,{recursive:true});
  }
});
const siteDir='/var/www/blog', id='12345678-1234-1234-1234-123456789abc';
const archive={archivePath:'local.tar.gz',archiveSha256:'a'.repeat(64),archiveBytes:100,manifest:{releaseId:id}};
const paths={incoming:`${siteDir}.deploy/incoming-${id}`,archivePath:`${siteDir}.deploy/incoming-${id}/package.tar.gz`,manifestPath:`${siteDir}.deploy/incoming-${id}/manifest.json`};
test('uploads only package and manifest before activation',async()=>{
  const calls=[];
  const remote=async(_,params)=>{calls.push(params.action);return params.action==='prepare'?paths:{success:true};};
  const sftp={fastPut:async()=>calls.push('archive'),put:async()=>calls.push('manifest')};
  await publishArchive(sftp,siteDir,archive,{remote,log:()=>{}});
  assert.deepEqual(calls,['prepare','archive','manifest','activate']);
});
test('failed upload discards only staging and never activates',async()=>{
  for(const failure of ['archive','manifest']){
    const calls=[];
    const remote=async(_,params)=>{calls.push(params.action);return paths;};
    const sftp={fastPut:async()=>{if(failure==='archive')throw Error('network');},put:async()=>{throw Error('network');}};
    await assert.rejects(publishArchive(sftp,siteDir,archive,{remote,log:()=>{}}),/network/);
    assert.deepEqual(calls,['prepare','discard']);
  }
});
test('uncertain activation never discards rollback/recovery state',async()=>{
  const calls=[];
  const remote=async(_,params)=>{calls.push(params.action);if(params.action==='activate')throw Error('disconnected');return paths;};
  await assert.rejects(publishArchive({fastPut:async()=>{},put:async()=>{}},siteDir,archive,{remote,log:()=>{}}),/--status/);
  assert.deepEqual(calls,['prepare','activate']);
});
test('unexpected server paths are rejected before file upload',async()=>{
  let uploaded=false;
  await assert.rejects(publishArchive({fastPut:async()=>{uploaded=true;}},siteDir,archive,{remote:async()=>({...paths,archivePath:'/var/www/blog/index.html'}),log:()=>{}}),/Unexpected/);
  assert.equal(uploaded,false);
});

test('late SSH callback after timeout never sends executable helper code',async()=>{
  let sent=false,closed=false;
  const stream={close:()=>{closed=true;},end:()=>{sent=true;}};
  const remote={client:{exec:(_,callback)=>setTimeout(()=>callback(null,stream),20)}};
  await assert.rejects(runRemote(remote,{action:'activate'},{timeoutMs:1}),/timed out/);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(sent,false);assert.equal(closed,true);
});
test('invalid JSON result types reject without crashing event handlers',async()=>{
  for(const body of ['null','[]','true','{"success":"yes"}']){
    const stream=new EventEmitter();stream.stderr=new EventEmitter();
    stream.end=()=>{queueMicrotask(()=>{stream.emit('data',Buffer.from(body));stream.emit('close',0);});};
    await assert.rejects(runRemote({client:{exec:(_,callback)=>callback(null,stream)}},{action:'status'}));
  }
});
