import fs from 'node:fs/promises';
import path from 'node:path';
import {renderMarkdown} from './renderer.mjs';
import katexCss from './katex-inline.css';
export {renderMarkdown};
export const apiVersion=1;
export async function renderPreview(context){
 const {text,file}=context;
   const rendered=await renderMarkdown(text);
   const doc=context.parseHtml(rendered.html);
   for(const card of doc.querySelectorAll('post-reference')){
    const slug=card.getAttribute('slug')||'';const match=context.findPost(slug);const data=match?context.metadata(match):null;
    const link=doc.createElement('a');link.className='article-post-card';link.href=new URL(context.config.postUrlPrefix+slug.split('/').map(encodeURIComponent).join('/')+'/',context.config.siteUrl).href;
    const copy=doc.createElement('span');copy.className='post-card-copy';const strong=doc.createElement('strong');strong.textContent=data?.title||slug;copy.append(strong);const desc=doc.createElement('span');desc.className='post-card-description';desc.textContent=data?.description||'站内文章';copy.append(desc);
    if(data?.image&&match){const image=doc.createElement('img');image.src=await context.resolveAsset(data.image,match);image.alt='';link.append(image);}else {const placeholder=doc.createElement('span');placeholder.className='post-card-placeholder';placeholder.textContent='↗';link.append(placeholder);}link.append(copy);card.replaceWith(link);
   }
   for(const card of doc.querySelectorAll('github')){const repo=card.getAttribute('repo')||'';const link=doc.createElement('a');link.className='preview-github';link.href='https://github.com/'+repo;link.textContent='GitHub · '+repo+' ↗';card.replaceWith(link);}
   let missing=0;for(const el of doc.querySelectorAll('img[src],audio[src],source[src]')){const old=el.getAttribute('src');const src=await context.resolveAsset(old,file);if(src)el.setAttribute('src',src);else {el.removeAttribute('src');missing++;if(el.tagName==='IMG')el.setAttribute('alt','本地图片无法读取：'+old);}}
   const css=(await Promise.all(context.config.styles.map(p=>fs.readFile(path.resolve(context.root,p),'utf8')))).join('\n');
   const content=doc.body.innerHTML;const title=String(rendered.data.title||file.basename).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const draw=()=>{const dark=context.theme.startsWith('dark'),yellow=context.theme.endsWith('yellow');
    return `<!doctype html><html class="${dark?'dark':''}" data-yellow="${yellow}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; media-src data: https: http:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-tonks-preview';"><style>${katexCss}\n${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><article id="post-container"><h1 class="preview-title">${title}</h1><div class="custom-md">${content}</div></article><script nonce="tonks-preview">document.querySelectorAll('.spoiler-trigger').forEach(b=>b.addEventListener('click',()=>{const p=b.parentElement,c=p.querySelector('.spoiler-content');p.classList.toggle('is-revealed');const open=p.classList.contains('is-revealed');b.setAttribute('aria-expanded',open);c?.setAttribute('aria-hidden',!open);if(c)c.inert=!open;}));document.querySelectorAll('a').forEach(a=>a.addEventListener('click',e=>{const h=a.getAttribute('href');if(h?.startsWith('#'))return;e.preventDefault();}));</script></body></html>`;
   };return {html:draw(),missing};
}
