import {visit} from 'unist-util-visit';
import {createHash} from 'node:crypto';

const key = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const text = node => node.value ?? (node.children || []).map(text).join('');
export function definition(node, source = '') {
  const a = node.attributes || {};
  const lists = node.children.filter(n => n.type === 'list');
  if (node.children.length !== 1 || lists.length !== 1) throw new Error('poll 正文必须是一个选项列表');
  const options = lists[0].children.map(item => {
    // GFM consumes [x]/[X] as task markers before this transformer runs.
    // Recover the original identifier so editor, Astro and manifest agree.
    const marker = item.checked === true
      ? source.slice(item.position.start.offset, item.position.end.offset).match(/^(?:[-+*]|\d+[.)])\s+\[([xX])\]\s+/)?.[1]
      : null;
    const value = `${marker ? `[${marker}] ` : ''}${text(item).trim()}`;
    const match = value.match(/^\[([a-zA-Z0-9_-]+)\]\s+(.+)$/s);
    if (!match || !key.test(match[1]) || match[2].length > 200) throw new Error('poll 选项格式：- [a] 选项文字（最多 200 字符）');
    return {id: match[1], label: match[2]};
  });
  if (!key.test(a.id || '') || !a.title?.trim() || a.title.length > 200 || options.length < 2 || options.length > 8 || new Set(options.map(o=>o.id)).size !== options.length) throw new Error('poll 需要唯一 ID、标题以及 2–8 个不同的选项');
  if (a.answer && !options.some(o=>o.id === a.answer)) throw new Error('poll 正确答案必须对应选项 ID');
  if ((a.explanation || '').length > 1000 || (a.explanation && !a.answer)) throw new Error('poll 解析需要正确答案，最多 1000 字符');
  const result = {id:a.id, title:a.title.trim(), options, answer:a.answer || null, explanation:a.explanation || ''};
  // Public versions must not be an oracle for guessing a quiz's small answer set.
  // The backend freezes private fields on first sync; changing them needs a new ID.
  const publicDefinition = {id:result.id,title:result.title,options:result.options};
  return {...result, version:createHash('sha256').update(JSON.stringify(publicDefinition)).digest('hex')};
}
const element = (tagName, properties, children=[]) => ({type:'element',tagName,properties,children});
const literal = value => ({type:'text',value});
export function pollElement(poll, preview=false) {
  const {id,title,options,answer,explanation,version} = poll;
  return element('section', {className:['article-poll','no-styling'], 'data-poll-id':id,'data-poll-version':version,
    ...(preview?{'data-poll-preview':'true','data-poll-answer':answer||'','data-poll-explanation':explanation}:{}), 'aria-label':title}, [
    element('div',{className:['poll-eyebrow']},[literal(answer?'小测验 · 单选':'投票 · 单选')]),
    element('div',{className:['poll-title'],role:'heading','aria-level':'3'},[literal(title)]),
    element('form',{},[
      element('fieldset',{},[element('legend',{className:['poll-sr-only']},[literal(title)]),...options.map(o=>element('label',{className:['poll-option'],'data-option':o.id},[
        element('span',{className:['poll-fill'],'aria-hidden':'true'}),
        element('input',{type:'radio',name:`poll-${id}`,value:o.id,required:true}),
        element('span',{className:['poll-label']},[literal(o.label)]),
        element('span',{className:['poll-result']}),
      ]))]),
      element('button',{type:'submit',className:['poll-submit']},[literal(preview?'模拟选择':'提交选择')]),
    ]),
    element('div',{className:['poll-comparison'],hidden:true,'aria-label':'双方选择比例'}),
    element('p',{className:['poll-status'],role:'status','aria-live':'polite'},[literal(preview?'离线预览 · 不记录真实投票':'投票后查看比例 · 同一身份仅可投一次')]),
    element('p',{className:['poll-explanation'],hidden:true}),
  ]);
}
export default function remarkPolls({preview=false,collect}={}) {
  return (tree, file) => { const ids = new Set(); visit(tree,'containerDirective',node=>{
    if(node.name !== 'poll')return;
    const poll=definition(node, String(file?.value || ''));
    if(ids.has(poll.id))throw new Error(`重复投票 ID：${poll.id}`);
    ids.add(poll.id);collect?.(poll);
    // Replace before the generic directive plugin; no answer survives in public HAST.
    const rendered=pollElement(poll,preview);
    node.type='paragraph';node.children=[];node.data={hName:rendered.tagName,hProperties:rendered.properties,hChildren:rendered.children};
    delete node.attributes; delete node.name;
  });};
}
