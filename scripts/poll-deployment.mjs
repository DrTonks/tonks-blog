import fs from 'node:fs';
import path from 'node:path';
import {generatePollManifest} from './poll-manifest.mjs';

export async function readPollDeployment(root){
  // Recompute from current sources; never trust a stale private cache from an older build.
  const publicManifest=await generatePollManifest(root);
  const built=JSON.parse(fs.readFileSync(path.join(root,'dist/community/polls.json'),'utf8'));
  if(JSON.stringify(built)!==JSON.stringify(publicManifest))throw new Error('Poll definitions changed since build; rebuild before deployment');
  return JSON.parse(fs.readFileSync(path.join(root,'.cache/poll-definitions.json'),'utf8'));
}
export async function syncPollBackend(sftp,manifest,backendRoot='/var/sleepy'){
  if(!manifest.polls.length)return;
  // Private definitions travel only through SSH stdin, never into the public archive.
  const source=`import sys,json,os\nfrom pathlib import Path\nroot=Path(${JSON.stringify(backendRoot)})\nos.chdir(root)\nsys.path.insert(0,str(root))\nfrom sleepy_app.app import create_app\napp=create_app()\ntry:\n count=app.extensions['article_polls'].sync(json.loads(${JSON.stringify(JSON.stringify(manifest))}))\nexcept ValueError as exc:\n ident=getattr(exc,'poll_id',None)\n fields=getattr(exc,'fields',None)\n if ident and fields:\n  print('POLL_SYNC_CONFLICT:'+json.dumps({'id':ident,'fields':fields}))\n sys.exit(1)\nprint('POLL_SYNC_OK:'+str(count))\n`;
  if(!/^\/[a-zA-Z0-9_./-]+$/.test(backendRoot)||backendRoot.includes('..'))throw new Error('Invalid backend root');
  await new Promise((resolve,reject)=>{
    let channel,settled=false,output='';
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
    const timer=setTimeout(()=>{channel?.close();finish(new Error('Poll backend synchronization timed out; frontend not published'));},30000);
    sftp.client.exec(`exec ${backendRoot}/venv/bin/python -`,(error,stream)=>{
      if(error)return finish(error);if(settled){stream.close();return;}channel=stream;
      stream.on('data',data=>{if(output.length<8192)output+=data.toString();});
      stream.stderr.on('data',()=>{}); // Never echo private quiz definitions in tracebacks.
      stream.on('error',()=>finish(new Error('Poll backend synchronization failed')));
      stream.on('close',code=>{
        if(code===0&&output.includes('POLL_SYNC_OK:'))return finish();
        // Only accept structured identifiers/field names; never expose quiz text or tracebacks.
        for(const line of output.split(/\r?\n/)){
          if(!line.startsWith('POLL_SYNC_CONFLICT:'))continue;
          try{
            const conflict=JSON.parse(line.slice('POLL_SYNC_CONFLICT:'.length));
            if(typeof conflict.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(conflict.id)&&Array.isArray(conflict.fields)&&conflict.fields.length&&conflict.fields.every(f=>['options','answer'].includes(f))){
              const labels=conflict.fields.map(f=>f==='options'?'选项 ID 或文案':'正确答案／投票类型');
              return finish(new Error(`投票 ${conflict.id} 修改了锁定字段：${labels.join('、')}。请恢复这些字段，或为新题使用新 ID；标题和解析可沿用原 ID 修改（需新版后端）。前端未发布。`));
            }
          }catch{}
        }
        finish(new Error('Poll backend synchronization failed; check backend compatibility and immutable poll options/answer. Frontend not published.'));
      });
      stream.end(source);
    });
  });
}
