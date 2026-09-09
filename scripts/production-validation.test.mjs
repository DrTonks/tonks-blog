import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assertArchiveValidated,assertBuildProvenance,validateArtifacts,assertDeploymentValidated,fingerprint,sourceFingerprint} from './production-validation.mjs';
function fixture(t){const project=fs.mkdtempSync(path.join(os.tmpdir(),'blog-gate-test-')),root=path.join(project,'dist');t.after(()=>fs.rmSync(project,{recursive:true,force:true}));const put=(key,body)=>{const p=path.join(root,key);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,body);};
 for(const d of ['src','public','scripts'])fs.mkdirSync(path.join(project,d));
 const html='<html><head><link rel="stylesheet" href="/_astro/base.css"><script type="module" src="/_astro/main.js"></script></head><body></body></html>';
 for(const p of ['index.html','about/index.html','posts/test/index.html'])put(p,html);
 put('_astro/base.css',':root{--page-bg:white;--primary:blue;--radius-large:1rem}.card-base{}.float-panel-closed{}.custom-md{}');put('_astro/main.js','import "./chunk.js";');put('_astro/chunk.js','export const n=1;');
 for(const p of ['version.json','.htaccess','community/articles.json','pagefind/pagefind.js'])put(p,'{}');return {project,root,put,html};}
test('valid production dependency graph passes',t=>{const f=fixture(t);assert(validateArtifacts(f.root).references>0);});
test('a removed CSS link fails even if the orphan stylesheet exists',t=>{const f=fixture(t);f.put('index.html',f.html.replace('<link rel="stylesheet" href="/_astro/base.css">',''));assert.throws(()=>validateArtifacts(f.root),/Critical stylesheet/);});
test('missing JS transitive chunk blocks upload',t=>{const f=fixture(t);fs.unlinkSync(path.join(f.root,'_astro/chunk.js'));assert.throws(()=>validateArtifacts(f.root),/chunk.js/);});
test('missing CSS asset and Pagefind entry block upload',t=>{const f=fixture(t);f.put('_astro/base.css','body{background:url(./lost.png)}');assert.throws(()=>validateArtifacts(f.root),/lost.png/);fs.unlinkSync(path.join(f.root,'pagefind/pagefind.js'));assert.throws(()=>validateArtifacts(f.root),/pagefind/);});
test('receipt binds source and artifacts; exclusions cannot bypass it',t=>{const f=fixture(t),result=validateArtifacts(f.root);fs.mkdirSync(path.join(f.project,'.cache'));const receipt={schema:1,artifacts:fingerprint(result.files),source:sourceFingerprint(f.project)};fs.writeFileSync(path.join(f.project,'.cache/production-validation.json'),JSON.stringify(receipt));fs.writeFileSync(path.join(f.project,'.cache/build-provenance.json'),JSON.stringify(receipt));assertDeploymentValidated(f.project,result.files);assert.throws(()=>assertDeploymentValidated(f.project,result.files.filter(x=>x.key!=='_astro/base.css')),/excludes/);fs.writeFileSync(path.join(f.project,'src/change.ts'),'changed');assert.throws(()=>assertDeploymentValidated(f.project),/differ|changed/);});

test('old dist cannot be approved against edited source',t=>{const f=fixture(t);assert.throws(()=>assertBuildProvenance(f.project,validateArtifacts(f.root)),/provenance missing/);});

test('valid provenance rejects later artifact changes',t=>{const f=fixture(t),v=validateArtifacts(f.root);fs.mkdirSync(path.join(f.project,'.cache'));fs.writeFileSync(path.join(f.project,'.cache/build-provenance.json'),JSON.stringify({schema:1,source:sourceFingerprint(f.project),artifacts:fingerprint(v.files)}));assertBuildProvenance(f.project,v);f.put('_astro/chunk.js','changed');assert.throws(()=>assertBuildProvenance(f.project,validateArtifacts(f.root)),/differ/);});
test('generated subset is excluded but original font and config are build inputs',t=>{const f=fixture(t),dir=path.join(f.project,'public/assets/font');fs.mkdirSync(dir,{recursive:true});const before=sourceFingerprint(f.project);fs.writeFileSync(path.join(dir,'Hanalei-subset.woff2'),'generated');assert.equal(sourceFingerprint(f.project),before);fs.writeFileSync(path.join(dir,'Hanalei.woff2'),'original');assert.notEqual(sourceFingerprint(f.project),before);const second=sourceFingerprint(f.project);fs.writeFileSync(path.join(f.project,'postcss.config.mjs'),'changed');assert.notEqual(sourceFingerprint(f.project),second);});
test('archive must contain exactly the browser-validated hashes',t=>{const f=fixture(t),v=validateArtifacts(f.root),manifest={files:v.files.map(f=>({path:f.key,sha256:f.sha256}))};assertArchiveValidated(manifest,v);manifest.files[0].sha256='changed';assert.throws(()=>assertArchiveValidated(manifest,v),/Archive differs/);});
