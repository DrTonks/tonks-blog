import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {frontmatter,walk} from './image-pipeline-utils.mjs';
import remarkPolls from '../src/plugins/remark-polls.mjs';
import directive from 'remark-directive';
import {visit} from 'unist-util-visit';
const require=createRequire(import.meta.url);
const astro=createRequire(require.resolve('astro'));
const markdown=createRequire(astro.resolve('@astrojs/markdown-remark'));
const {unified}=await import(/* @vite-ignore */ pathToFileURL(markdown.resolve('unified')).href);
const {default:parse}=await import(/* @vite-ignore */ pathToFileURL(markdown.resolve('remark-parse')).href);
const {default:gfm}=await import(/* @vite-ignore */ pathToFileURL(markdown.resolve('remark-gfm')).href);
export function omitPollsFromSummary(body){
  const tree=unified().use(parse).use(directive).parse(body),ranges=[];
  visit(tree,'containerDirective',node=>{if(node.name==='poll')ranges.push([node.position.start.offset,node.position.end.offset]);});
  for(const [start,end] of ranges.sort((a,b)=>b[0]-a[0]))body=body.slice(0,start)+body.slice(end);
  return body;
}
export async function extractPolls(source) {
  const polls=[];
  const body=source.replace(/^\uFEFF?---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/,'');
  const processor=unified().use(parse).use(gfm).use(directive).use(remarkPolls,{collect:p=>polls.push(p)});
  await processor.run(processor.parse(body), {value:body});return polls;
}
export async function generatePollManifest(root) {
  const polls=[],ids=new Set();
  for(const file of await walk(resolve(root,'src/content/posts'))) {
    if(!/\.md$/i.test(file))continue;
    const source=await readFile(file,'utf8'),meta=frontmatter(source,file);
    if(meta.draft || meta.encrypted)continue;
    for(const poll of await extractPolls(source)) {
      if(ids.has(poll.id))throw new Error(`重复的全站投票 ID：${poll.id} (${file})`);
      ids.add(poll.id);polls.push(poll);
    }
  }
  const privateManifest={schema:1,polls};
  const publicManifest={schema:1,polls:polls.map(({id,version})=>({id,version}))};
  await mkdir(resolve(root,'.cache'),{recursive:true});
  await writeFile(resolve(root,'.cache/poll-definitions.json'),JSON.stringify(privateManifest));
  await writeFile(resolve(root,'.cache/polls.json'),JSON.stringify(publicManifest));
  return publicManifest;
}
