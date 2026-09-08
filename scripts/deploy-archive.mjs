import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

export const localPython = process.env.DEPLOY_PYTHON || process.env.FONT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

export function parseDeployArgs(args) {
  const options = new Map([['--check','check'],['--status','status'],['--recover','recover'],['--rollback','rollback'],['--pack-only','pack']]);
  if (!args.length) return 'deploy';
  if (args.length !== 1 || !options.has(args[0])) throw new Error('Use no option, --check, --status, --recover, --rollback, or --pack-only');
  return options.get(args[0]);
}

export function validateSiteDir(value) {
  if (typeof value !== 'string' || !/^\/[A-Za-z0-9_./-]+$/.test(value) || value.endsWith('/') || value.split('/').includes('..') || path.posix.normalize(value) !== value || value.split('/').filter(Boolean).length < 3) {
    throw new Error('remoteDir must be a canonical absolute site path at least three components deep');
  }
  return value;
}

export function validateArchiveKey(key) {
  if (!key || key.includes('\\') || key.includes(':') || /[\x00-\x1f\x7f]/.test(key) || key.startsWith('/') || key.split('/').some(part => !part || part === '.' || part === '..' || part === '.tonks-deploy-release.json')) {
    throw new Error(`Unsafe or reserved archive path: ${JSON.stringify(key)}`);
  }
  return key;
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function createArchive(localDir, files) {
  const start = performance.now();
  const root = path.resolve(localDir);
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new Error('dist must be a real directory');
  for (const required of ['index.html','version.json','.htaccess','community/articles.json']) {
    if (!files.some(file => file.key === required)) throw new Error(`dist requires ${required}`);
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  if (typeof version.id !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(version.id)) throw new Error('Invalid dist/version.json id');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tonks-blog-archive-'));
  const cleanup = () => {
    // Only remove this mkdtemp result, never a caller-supplied directory.
    if (path.dirname(path.resolve(tempDir)) !== path.resolve(os.tmpdir()) || !path.basename(tempDir).startsWith('tonks-blog-archive-') || fs.lstatSync(tempDir).isSymbolicLink()) throw new Error('Unsafe local temporary directory');
    fs.rmSync(tempDir, { recursive: true });
  };
  try {
    const entries = [];
    const seen = new Set();
    for (const file of files) {
      const key = validateArchiveKey(file.key);
      if (seen.has(key)) throw new Error(`Duplicate archive path: ${key}`);
      seen.add(key);
      const expectedPath = path.join(root, ...key.split('/'));
      if (path.resolve(file.localPath) !== expectedPath || fs.realpathSync(expectedPath) !== fs.realpathSync(root) + path.sep + key.split('/').join(path.sep)) throw new Error(`Archive source escapes dist: ${key}`);
      const stat = fs.lstatSync(expectedPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${key}`);
      entries.push({ path: key, size: stat.size, sha256: await sha256(expectedPath) });
    }
    const releaseId = randomUUID();
    const manifest = {schema:1, releaseId, versionId:version.id, files:entries, totalBytes:entries.reduce((sum,file)=>sum+file.size,0)};
    fs.writeFileSync(path.join(tempDir,'manifest.json'),JSON.stringify(manifest));
    const archivePath = path.join(tempDir, 'site.tar.gz');
    const child = spawn(localPython, [fileURLToPath(new URL('./deploy_pack.py',import.meta.url)),root,path.join(tempDir,'manifest.json')], {windowsHide:true,stdio:['ignore','pipe','pipe']});
    let diagnostic = '';
    child.stderr.on('data', chunk => { if (diagnostic.length < 65536) diagnostic += chunk.toString(); });
    const completed = new Promise((resolve,reject) => {
      child.on('error',reject);
      child.on('close',code=>code===0?resolve():reject(new Error(`Archive packer failed (${code}): ${diagnostic}`)));
    });
    const zipped = pipeline(child.stdout,createGzip({level:1}),fs.createWriteStream(archivePath,{flags:'wx'}));
    try { await Promise.all([completed, zipped]); }
    catch (error) { child.kill(); await Promise.allSettled([completed,zipped]); throw error; }
    return {tempDir,archivePath,manifest,archiveSha256:await sha256(archivePath),archiveBytes:fs.statSync(archivePath).size,seconds:(performance.now()-start)/1000,cleanup};
  } catch (error) {
    try { cleanup(); } catch (cleanupError) { error.message+=`; temporary cleanup failed: ${cleanupError.message}`; }
    throw error;
  }
}

export function runRemote(sftp, parameters, {timeoutMs=180000}={}) {
  const source = fs.readFileSync(new URL('./deploy_remote.py',import.meta.url));
  const args = Buffer.from(JSON.stringify(parameters)).toString('base64');
  // All variable arguments travel as base64 JSON; paths never become shell code.
  return new Promise((resolve,reject) => {
    let settled = false;
    const finish = (error,value) => {if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    let channel;
    const timer = setTimeout(()=>{try{channel?.signal('TERM');}catch{}finish(new Error('Remote helper timed out; activation may need --status verification'));},timeoutMs);
    const connected = (error,stream) => {
      if(settled){stream?.close();return;}
      if(error)return finish(error);
      channel=stream;
      let stdout='',stderr='';
      stream.on('data',chunk=>{if(stdout.length<2_000_000)stdout+=chunk.toString();});
      stream.stderr.on('data',chunk=>{if(stderr.length<65536)stderr+=chunk.toString();});
      stream.on('error',error=>finish(error));
      stream.on('close',code=>{
        let result;
        try { result=JSON.parse(stdout.trim() || stderr); } catch {return finish(new Error(`Remote helper returned invalid output (${code}): ${stderr}`));}
        if(!result || typeof result!=='object' || Array.isArray(result))return finish(new Error('Remote helper returned an invalid result object'));
        if(code!==0 || result.success!==true)return finish(new Error(result.error || stderr || `Remote helper failed (${code})`));
        finish(null,result);
      });
      try {stream.end(source);} catch(error) {finish(error);stream.close();}
    };
    try {sftp.client.exec(`exec python3 - '${args}'`, connected);} catch(error) {finish(error);}
  });
}

export async function publishArchive(sftp, siteDir, archive, {remote=runRemote,log=console.log}={}) {
  const releaseId=archive.manifest.releaseId;
  let prepared=false,activationAttempted=false;
  try {
    const target=await remote(sftp,{action:'prepare',siteDir,releaseId,archiveSha256:archive.archiveSha256});
    const expected=`${siteDir}.deploy/incoming-${releaseId}`;
    if(target.incoming!==expected || target.archivePath!==`${expected}/package.tar.gz` || target.manifestPath!==`${expected}/manifest.json`)throw new Error('Unexpected remote staging paths');
    prepared=true;
    const uploadStart=performance.now();
    await sftp.fastPut(archive.archivePath,target.archivePath,{concurrency:16,chunkSize:64*1024});
    await sftp.put(Buffer.from(JSON.stringify(archive.manifest)),target.manifestPath);
    log(`Archive upload: ${((performance.now()-uploadStart)/1000).toFixed(2)}s (${(archive.archiveBytes/1048576).toFixed(2)} MiB)`);
    activationAttempted=true;
    const result=await remote(sftp,{action:'activate',siteDir,releaseId,archiveSha256:archive.archiveSha256});
    return result;
  } catch(error) {
    if(prepared && !activationAttempted) {
      await remote(sftp,{action:'discard',siteDir,releaseId}).catch(cleanupError=>log(`Staging cleanup deferred: ${cleanupError.message}`));
    }
    if(activationAttempted) error.message+='; inspect node scripts/deploy.js --status before retrying. Do not manually remove the staging directory.';
    throw error;
  }
}
