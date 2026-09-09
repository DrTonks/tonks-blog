import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'node-html-parser';
import ts from 'typescript';
const digest=b=>createHash('sha256').update(b).digest('hex');
export function walk(root){
 const out=[];
 function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error(`Symbolic link rejected: ${p}`);if(e.isDirectory())visit(p);else if(e.isFile())out.push(path.relative(root,p).split(path.sep).join('/'));}}
 visit(root);return out;
}
export function inventory(root){return walk(root).map(key=>({key,sha256:digest(fs.readFileSync(path.join(root,key)))}));}
export function fingerprint(files){return digest(JSON.stringify(files));}
export function sourceInventory(root){
 const files=[];
 for(const name of ['src','public','scripts'])for(const entry of inventory(path.join(root,name))){if(name==='public'&&entry.key.startsWith('assets/font/Hanalei-subset.woff2'))continue;if(entry.key.split('/').includes('__pycache__'))continue;files.push({...entry,key:`${name}/${entry.key}`});}
 for(const name of ['package.json','pnpm-lock.yaml','astro.config.mjs','tailwind.config.cjs','tailwind.config.js','postcss.config.cjs','postcss.config.mjs','svelte.config.js','requirements-font.txt','tsconfig.json','site-version.json'])if(fs.existsSync(path.join(root,name)))files.push({key:name,sha256:digest(fs.readFileSync(path.join(root,name)))});
 return files;
}
export function sourceFingerprint(root){return fingerprint(sourceInventory(root));}
export function validateArtifacts(root){
 const files=walk(root),keys=new Set(files),missing=[];let references=0;
 const required=['index.html','about/index.html','version.json','.htaccess','community/articles.json','pagefind/pagefind.js'];
 for(const key of required)if(!keys.has(key)||!fs.statSync(path.join(root,key)).size)missing.push(`Required artifact: ${key}`);
 const source=(key)=>fs.readFileSync(path.join(root,key),'utf8');
 function resolve(ref,from){
  if(!ref||/^(?:data:|blob:|https?:|\/\/|#|mailto:|javascript:)/i.test(ref))return null;
  const u=new URL(ref,`https://build.invalid/${from}`);if(u.origin!=='https://build.invalid')return null;
  const key=decodeURIComponent(u.pathname).replace(/^\//,'');references++;
  if(!keys.has(key))missing.push(`${from} -> ${key}`);return key;
 }
 const html=new Map();
 for(const key of files){
  if(/\.html$/i.test(key)){
   const doc=parse(source(key));html.set(key,doc);
   for(const e of doc.querySelectorAll('script[src],img[src],source[src],video[src],audio[src],video[poster],link[href]')){
    if(e.tagName==='LINK'&&!/stylesheet|icon|preload|modulepreload/i.test(e.getAttribute('rel')||''))continue;
    resolve(e.getAttribute('src')||e.getAttribute('poster')||e.getAttribute('href'),key);
   }
   for(const e of doc.querySelectorAll('img[srcset],source[srcset]')){const set=e.getAttribute('srcset');if(!set.startsWith('data:'))for(const s of set.split(','))resolve(s.trim().split(/\s+/)[0],key);}
  }
  if(/\.css$/i.test(key))for(const m of source(key).matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g))resolve(m[1].trim(),key);
  if(/\.[cm]?js$/i.test(key)){
   const doc=ts.createSourceFile(key,source(key),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
   const visit=n=>{let literal;
    if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))literal=n.moduleSpecifier;
    else if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword)literal=n.arguments[0];
    if(literal&&ts.isStringLiteral(literal)&&/^(\.\.?\/|\/)/.test(literal.text))resolve(literal.text,key);
    ts.forEachChild(n,visit);
   };visit(doc);
  }
 }
 if(missing.length)throw new Error(`Production artifact dependencies missing:\n${missing.slice(0,25).join('\n')}`);
 const article=files.find(k=>/^posts\/.*\/index\.html$/.test(k));if(!article)throw new Error('No production article found');
 // Only CSS actually attached to the page counts; orphan files cannot satisfy this gate.
 for(const key of ['index.html','about/index.html',article]){
  const doc=html.get(key);let css=doc.querySelectorAll('style').map(e=>e.textContent).join('\n');
  for(const e of doc.querySelectorAll('link[rel="stylesheet"]')){const ref=e.getAttribute('href');if(/^https?:|^\/\//.test(ref))continue;const local=resolve(ref,key);if(local)css+='\n'+source(local);}
  for(const rule of ['--page-bg','--primary','--radius-large','.card-base','.float-panel-closed','.custom-md'])if(!css.includes(rule))throw new Error(`Critical stylesheet missing from ${key}: ${rule}`);
 }
 return {files:inventory(root),references,article};
}
export function assertBuildProvenance(project,result){
 const file=path.join(project,'.cache/build-provenance.json');
 if(!fs.existsSync(file))throw new Error('Build provenance missing. Run pnpm build or pnpm ship.');
 const provenance=JSON.parse(fs.readFileSync(file,'utf8'));
 if(provenance.schema!==1||provenance.source!==sourceFingerprint(project)||provenance.artifacts!==fingerprint(result.files))throw new Error('Source/artifacts differ from the completed build. Rebuild before validation.');
}
export function assertDeploymentValidated(project,selectedFiles){
 const current=validateArtifacts(path.join(project,'dist'));
 assertBuildProvenance(project,current);
 const receiptPath=path.join(project,'.cache/production-validation.json');
 if(!fs.existsSync(receiptPath))throw new Error('Production artifact validation is required. Run pnpm build or pnpm ship.');
 const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
 if(receipt.schema!==1||receipt.artifacts!==fingerprint(current.files)||receipt.source!==sourceFingerprint(project))throw new Error('Build/source changed since artifact validation. Run pnpm ship again.');
 if(selectedFiles){const included=new Set(selectedFiles.map(f=>f.key));for(const f of current.files)if(!included.has(f.key))throw new Error(`Deployment excludes validated artifact: ${f.key}`);}
 return current;
}

export function assertArchiveValidated(manifest,validated){
 const expected=new Map(validated.files.map(f=>[f.key,f.sha256]));
 if(manifest.files.length!==expected.size)throw new Error('Archive file count differs from validated build');
 for(const file of manifest.files){if(expected.get(file.path)!==file.sha256)throw new Error(`Archive differs from validated build: ${file.path}`);expected.delete(file.path);}
 if(expected.size)throw new Error('Archive omits validated files');
}
