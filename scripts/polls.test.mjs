import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {extractPolls,omitPollsFromSummary} from './poll-manifest.mjs';
import remarkPolls from '../src/plugins/remark-polls.mjs';
import tableCards from '../src/plugins/rehype-table-cards.mjs';
import directive from 'remark-directive';
import {EventEmitter} from 'node:events';
import {syncPollBackend} from './poll-deployment.mjs';
import MarkdownIt from 'markdown-it';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),astro=createRequire(require.resolve('astro'));
const {createMarkdownProcessor}=await import(pathToFileURL(astro.resolve('@astrojs/markdown-remark')).href);
const source=':::poll{id="quiz-test" title="这是一个问题？" answer="b" explanation="PRIVATE_EXPLANATION"}\n- [a] A\n- [b] B\n:::';
test('public HTML renders poll without private answer/analysis, retaining usable inputs',async()=>{
 const p=await createMarkdownProcessor({remarkPlugins:[directive,remarkPolls],rehypePlugins:[tableCards]});
 const {code}=await p.render(source);
 assert.match(code,/article-poll/);assert.match(code,/type="radio"/);
 assert.doesNotMatch(code,/PRIVATE_EXPLANATION|data-poll-answer|answer="b"/);
 const table=await p.render('| A | B |\n|---|---|\n| 1 | 2 |');assert.match(table.code,/article-table-card/);assert.match(table.code,/<table>/);
});
test('extractor enforces valid choices and IDs, ignores fenced examples',async()=>{
 const [poll]=await extractPolls(source);assert.equal(poll.answer,'b');assert.equal(poll.options.length,2);
 assert.deepEqual(await extractPolls('```markdown\n'+source+'\n```'),[]);
 await assert.rejects(extractPolls(source.replace('answer="b"','answer="z"')));
 await assert.rejects(extractPolls(source.replace('- [b] B','- [a] B')));
 await assert.rejects(extractPolls(source+'\n\n'+source));
});
test('GFM task-like option IDs preserve x and X across public render and extraction',async()=>{
 const p=await createMarkdownProcessor({remarkPlugins:[directive,remarkPolls]});
 for(const id of ['x','X']) {
  const md=source.replace('- [a] A',`- [${id}] A`);
  const {code}=await p.render(md);
  const [poll]=await extractPolls(md);
  assert.match(code,new RegExp(`data-option="${id}"`));
  assert.match(code,new RegExp(`data-poll-version="${poll.version}"`));
 }
});
test('GFM formatted option labels generate identical page and manifest versions',async()=>{
 const p=await createMarkdownProcessor({remarkPlugins:[directive,remarkPolls]});
 const md=source.replace('- [a] A','- [a] A ~~old~~ **new**');
 const {code}=await p.render(md);const [poll]=await extractPolls(md);
 assert.match(code,new RegExp(`data-poll-version="${poll.version}"`));
});
test('AI summary input excludes interaction definitions and private answers',()=>{
 const body='文章正文\n\n'+source+'\n\n文章结尾';const filtered=omitPollsFromSummary(body);
 assert.match(filtered,/文章正文/);assert.match(filtered,/文章结尾/);assert.doesNotMatch(filtered,/PRIVATE_EXPLANATION|answer=|这是一个问题/);
});
test('public version cannot reveal an answer by enumerating private fields',async()=>{
 const [original]=await extractPolls(source);
 const [otherAnswer]=await extractPolls(source.replace('answer="b"','answer="a"'));
 const [otherExplanation]=await extractPolls(source.replace('PRIVATE_EXPLANATION','OTHER_PRIVATE_TEXT'));
 assert.equal(original.version,otherAnswer.version);
 assert.equal(original.version,otherExplanation.version);
});
test('RSS and Atom render sanitized Markdown without private poll definitions',async()=>{
 const html=new MarkdownIt().render(omitPollsFromSummary(`正文\n\n${source}\n\n结尾`));
 assert.match(html,/正文/);assert.match(html,/结尾/);assert.doesNotMatch(html,/PRIVATE_EXPLANATION|answer=/);
 for(const feed of ['rss','atom']) {
  const code=await readFile(new URL(`../src/pages/${feed}.xml.ts`,import.meta.url),'utf8');
  assert.match(code,/markdownParser\.render\(omitPollsFromSummary\(post\.body\)\)/);
 }
});
test('offline preview exposes answer only in local editor and retains interaction markup',async()=>{
 const {renderMarkdown}=require('../editor/dist/adapter.cjs');const {html}=await renderMarkdown(source);
 assert.match(html,/data-poll-answer="b"/);assert.match(html,/PRIVATE_EXPLANATION/);assert.match(html,/<form>/);assert.match(html,/<input/);
 const table=await renderMarkdown('| A | B |\n|:---:|---:|\n| 1 | 2 |');
 assert.match(table.html,/<th align="center">/);assert.match(table.html,/<td align="right">/);
});
test('private sync writes only to SSH stdin and requires positive backend acknowledgement',async()=>{
 const polls=await extractPolls(source);let command='',stdin='';
 const transport=(code,ack)=>({client:{exec(cmd,callback){
  command=cmd;const stream=new EventEmitter();stream.stderr=new EventEmitter();
  stream.end=text=>{stdin=text;queueMicrotask(()=>{stream.stderr.emit('data','PRIVATE_EXPLANATION');stream.emit('data',ack);stream.emit('close',code);});};
  callback(null,stream);
 }}});
 await syncPollBackend(transport(0,'POLL_SYNC_OK:1'),{schema:1,polls});
 assert.equal(command,'exec /var/sleepy/venv/bin/python -');
 assert.doesNotMatch(command,/PRIVATE_EXPLANATION/);assert.match(stdin,/PRIVATE_EXPLANATION/);
 for(const [code,ack] of [[1,'POLL_SYNC_OK:1'],[0,'']]) {
  let published=false;
  await assert.rejects(async()=>{await syncPollBackend(transport(code,ack),{schema:1,polls});published=true;},error=>!error.message.includes('PRIVATE_EXPLANATION'));
  assert.equal(published,false);
 }
 await assert.rejects(syncPollBackend({client:{exec(_cmd,callback){callback(new Error('connection failed'));}}},{schema:1,polls}));
 await assert.rejects(syncPollBackend(transport(0,'POLL_SYNC_OK:1'),{schema:1,polls},'/var/../bad'));
});
