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
const processor=unified().use(parse).use(gfm).use(math).use(directive).use(parseDirectiveNode).use(toHast,{allowDangerousHtml:true}).use(raw).use(slug).use(components).use(articleMedia).use(katex).use(stringify);
export function splitFrontmatter(text){
 const match=text.replace(/^\uFEFF/,'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
 return match?{data:yaml(match[1])||{},body:text.replace(/^\uFEFF/,'').slice(match[0].length)}:{data:{},body:text};
}
export async function renderMarkdown(text){
 const {data,body}=splitFrontmatter(text);
 const html=String(await processor.process(body));
 return {data,html:sanitize(html,{
  allowedTags:[...sanitize.defaults.allowedTags,'img','figure','figcaption','audio','source','button','details','summary','post-reference','github','math','semantics','annotation','mrow','mi','mo','mn','mtext','msup','msub','mfrac','msqrt','mtable','mtr','mtd','mspace','mover','munder','munderover','mpadded','msubsup','menclose'],
  allowedAttributes:{'*':['class','id','title','aria-*','data-*'],img:['src','alt','width','height','loading','decoding'],a:['href','rel'],audio:['src','controls','preload'],source:['src','type'],button:['type','aria-expanded'],details:['open'],'post-reference':['slug'],github:['repo'],span:['class','style','aria-hidden','inert'],div:['class','style','aria-hidden','inert'],math:['xmlns','display'],annotation:['encoding'],mo:['stretchy','fence','separator','lspace','rspace']},
  allowedSchemes:['https','http','mailto'],allowedSchemesByTag:{img:['http','https','data'],audio:['http','https'],source:['http','https']},allowProtocolRelative:false
 })};
}
