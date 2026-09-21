import remarkPolls from '@blog/src/plugins/remark-polls.mjs';
import tableCards from '@blog/src/plugins/rehype-table-cards.mjs';
import {unified} from 'unified';
import parse from 'remark-parse';
import gfm from 'remark-gfm';
import directive from 'remark-directive';
import math from 'remark-math';
import toHast from 'remark-rehype';
import raw from 'rehype-raw';
import stringify from 'rehype-stringify';
import katex from 'rehype-katex';
import slug from 'rehype-slug';
import {parse as yaml} from 'yaml';
import sanitize from 'sanitize-html';
import {parseDirectiveNode} from '@blog/src/plugins/remark-directive-rehype.js';
import articleMedia from '@blog/src/plugins/rehype-article-media.mjs';
import {AdmonitionComponent} from '@blog/src/plugins/rehype-component-admonition.mjs';

function components(){return tree=>{
 const walk=node=>{for(const child of node.children||[])walk(child);if(node.type!=='element')return;
 if(['note','tip','important','warning','caution'].includes(node.tagName))Object.assign(node,AdmonitionComponent(node.properties,node.children,node.tagName));
 };walk(tree);
};}
// KaTeX replaces display-math roots, so carry their source position to the result.
function positionedMath(){
 const transform=katex();
 return (tree,file)=>{
  tree.children=tree.children.flatMap(node=>{
   const fragment={type:'root',children:[node]};transform(fragment,file);
   for(const result of fragment.children)if(!result.position)result.position=node.position;
   return fragment.children;
  });
 };
}
function sourceBlocks(){return (tree,file)=>{
 const clear=node=>{if(node.properties){delete node.properties['data-preview-from'];delete node.properties['data-preview-to'];delete node.properties.dataPreviewFrom;delete node.properties.dataPreviewTo;}for(const child of node.children||[])clear(child);};clear(tree);
 if(!file.data.sourceMap)return;
 for(const node of tree.children){
  if(node.type!=='element'||node.properties?.dataFootnotes!==undefined)continue;
  // Table cards wrap the original positioned table; all other transforms retain position.
  const position=node.position||(node.tagName==='div'&&node.properties?.className?.includes('article-table-card')?node.children[0]?.position:null);
  if(!Number.isInteger(position?.start.offset)||!Number.isInteger(position?.end.offset))continue;
  node.properties['data-preview-from']=position.start.offset+file.data.bodyOffset;
  node.properties['data-preview-to']=position.end.offset+file.data.bodyOffset;
 }
};}
const processor=unified().use(parse).use(gfm).use(math).use(directive).use(remarkPolls,{preview:true}).use(parseDirectiveNode).use(toHast,{allowDangerousHtml:true}).use(raw).use(slug).use(components).use(articleMedia).use(tableCards).use(positionedMath).use(sourceBlocks).use(stringify);
export function splitFrontmatter(text){
 const match=text.replace(/^\uFEFF/,'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 return match?{data:yaml(match[1])||{},body:text.replace(/^\uFEFF/,'').slice(match[0].length)}:{data:{},body:text};
}
export async function renderMarkdown(text,{sourceMap=false}={}){
 const {data,body}=splitFrontmatter(text);
 const html=String(await processor.process({value:body,data:{sourceMap,bodyOffset:text.length-body.length}}));
 return {data,html:sanitize(html,{
  allowedTags:[...sanitize.defaults.allowedTags,'del','section','form','fieldset','legend','label','input','img','figure','figcaption','audio','source','button','details','summary','post-reference','github','math','semantics','annotation','mrow','mi','mo','mn','mtext','msup','msub','mfrac','msqrt','mtable','mtr','mtd','mspace','mover','munder','munderover','mpadded','msubsup','menclose'],
  allowedAttributes:{'*':['class','id','title','aria-*','data-*','hidden','tabindex','role'],img:['src','alt','width','height','loading','decoding'],a:['href','rel'],audio:['src','controls','preload'],source:['src','type'],th:['align'],td:['align'],input:['type','name','value','required'],button:['type','aria-expanded'],details:['open'],'post-reference':['slug'],github:['repo'],span:['class','style','aria-hidden','inert'],div:['class','style','aria-hidden','inert'],math:['xmlns','display'],annotation:['encoding'],mo:['stretchy','fence','separator','lspace','rspace']},
  allowedSchemes:['https','http','mailto'],allowedSchemesByTag:{img:['http','https','data'],audio:['http','https'],source:['http','https']},allowProtocolRelative:false
 })};
}
