import {unified} from 'unified';
import parse from 'remark-parse';
import stringify from 'remark-stringify';
import gfm from 'remark-gfm';
import math from 'remark-math';
import directive from 'remark-directive';
import {toString} from 'mdast-util-to-string';

const processor=unified().use(parse).use(gfm).use(math).use(directive).use(stringify,{bullet:'-',fences:true});
const text=value=>({type:'text',value});
const paragraph=value=>({type:'paragraph',children:[text(value)]});
export function publicArticle(data){return data.draft!==true && data.encrypted!==true;}
export function safePublicUrl(value,base){
  try{const u=new URL(value,base);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:null;}catch{return null;}
}
// A strict allowlist removes raw HTML, comments and custom directive attributes.
// Standard code fences are preserved as displayed text, never executed.
/** @param {string} source
 * @param {{canonical:string,title:string,resolveLink?:(value:string)=>string|null}} options */
export function publicMarkdown(source,{canonical,title,resolveLink=()=>null}){
  const body=source.replace(/^\uFEFF?---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/,'');
  const tree=processor.parse(body);
  const definitions=new Map();
  function collect(node){if(node.type==='definition')definitions.set(node.identifier,node.url);node.children?.forEach(collect);}
  collect(tree);
  function href(value){
    if(!value)return null;
    if(/^(?:https?:|mailto:|\/|#)/i.test(value))return safePublicUrl(value,canonical);
    return resolveLink(value);
  }
  function clean(node){
    if(node.type==='html'||node.type==='definition')return [];
    if(['containerDirective','leafDirective','textDirective'].includes(node.type)){
      if(node.name==='poll')return [paragraph('互动投票或提问：请到原文参与，本文不包含选项、答案和结果。')];
      const children=(node.children||[]).flatMap(clean);
      return node.type==='textDirective'?children:children.length?children:[];
    }
    if(node.type==='image'||node.type==='imageReference'){
      // Source-relative assets are compiled by Astro; don't invent public URLs.
      const value=node.url||definitions.get(node.identifier);
      const url=value && /^(?:https?:|\/)/i.test(value)?safePublicUrl(value,canonical):null;
      return url?[{type:'image',url,alt:node.alt||'',title:node.title}]:[text(node.alt?`[图片：${node.alt}，见原文]`:'[图片见原文]')];
    }
    const children=node.children?.flatMap(clean);
    if(node.type==='link'||node.type==='linkReference'){
      const url=href(node.url||definitions.get(node.identifier));
      return url?[{type:'link',url,title:node.title,children}]:children||[];
    }
    const allowed=new Set(['root','paragraph','heading','text','emphasis','strong','delete','blockquote','list','listItem','thematicBreak','break','code','inlineCode','table','tableRow','tableCell','footnoteDefinition','footnoteReference','math','inlineMath']);
    if(!allowed.has(node.type))return children||[];
    // No source positions, directive data or HTML attributes in the output tree.
    const copy={type:node.type};
    for(const key of ['value','depth','ordered','start','spread','checked','lang','meta','align','identifier','label'])if(node[key]!==undefined)copy[key]=node[key];
    if(children)copy.children=children;
    return [copy];
  }
  const cleanTree=clean(tree)[0];
  const heading=processor.stringify({type:'root',children:[{type:'heading',depth:1,children:[text(title)]}]}).trim();
  const markdown=`${heading}\n\n原文：${canonical}\n\n${processor.stringify(cleanTree)}`;
  return {markdown,text:toString(cleanTree)};
}

