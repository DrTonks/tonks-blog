import {spawn,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const font=spawnSync(process.execPath,[resolve(root,'scripts/run-font-subset.js'),'--source-only'],{cwd:root,stdio:'inherit',windowsHide:true});
if(font.status!==0)process.exit(font.status || 1);
const env={...process.env};
let backend;
const preview=process.argv.includes('--comments-preview');
if(preview && !existsSync(resolve(root,'../sleepy/article_comments.py')))throw new Error('Local article preview backend is missing');
if(preview && !env.SLEEPY_ARTICLE_DEV_TARGET && existsSync(resolve(root,'../sleepy/article_comments.py'))){
  const port=env.SLEEPY_ARTICLE_PREVIEW_PORT || '9012';
  backend=spawn(env.PYTHON || 'python',[resolve(root,'scripts/article-comments-preview.py')],{cwd:root,stdio:'inherit',windowsHide:true,env});
  backend.on('error',e=>console.error('[article preview]',e.message));
  env.SLEEPY_ARTICLE_DEV_TARGET=`http://127.0.0.1:${port}`;
  console.log('[article preview] Local data only. No production writes. Admin: local-preview');
}
const astro=spawn(process.execPath,[resolve(root,'node_modules/astro/astro.js'),'dev',...process.argv.slice(2).filter(arg=>arg!=='--comments-preview')],{cwd:root,stdio:'inherit',windowsHide:true,env});
const stop=()=>{backend?.kill();astro.kill();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
astro.on('exit',code=>{backend?.kill();process.exitCode=code || 0;});
process.on('exit',()=>backend?.kill());
