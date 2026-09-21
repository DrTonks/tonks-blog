import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {generatePollManifest} from './poll-manifest.mjs';
import {walk} from './image-pipeline-utils.mjs';
import {parse} from 'node-html-parser';
export default function pollsIntegration(){
  let root;
  return {name:'article-polls',hooks:{
    'astro:config:done':({config})=>{root=fileURLToPath(config.root);},
    'astro:server:setup':async({server})=>{
      await generatePollManifest(root);
      let queue=Promise.resolve();
      const update=file=>{if(file.replaceAll('\\','/').includes('/src/content/posts/'))queue=queue.catch(()=>{}).then(()=>generatePollManifest(root)).catch(e=>server.config.logger.error(e.message));};
      server.watcher.on('add',update).on('change',update).on('unlink',update);
      server.httpServer?.once('close',()=>{for(const event of ['add','change','unlink'])server.watcher.off(event,update);});
      server.middlewares.use('/community/polls.json',async(_req,res)=>{await queue;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(await readFile(resolve(root,'.cache/polls.json')));});
    },
    'astro:build:done':async({dir})=>{
      const manifest=await generatePollManifest(root);
      const rendered=new Map();
      for(const file of await walk(fileURLToPath(dir))){
        if(!file.endsWith('.html'))continue;
        for(const node of parse(await readFile(file,'utf8')).querySelectorAll('.article-poll'))rendered.set(node.getAttribute('data-poll-id'),node.getAttribute('data-poll-version'));
      }
      for(const poll of manifest.polls)if(rendered.get(poll.id)!==poll.version)throw new Error(`投票页面与定义不一致：${poll.id}；请清理 Astro 内容缓存后重新构建`);
      await mkdir(resolve(fileURLToPath(dir),'community'),{recursive:true});
      await writeFile(resolve(fileURLToPath(dir),'community/polls.json'),JSON.stringify(manifest));
    }
  }};
}
