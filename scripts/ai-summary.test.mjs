import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, readArticles, examplesFor, validateSummary, configFromEnv, generateSummary, readRecords, writeRecords, runSummaries, SUMMARY_PATH } from './ai-summary.mjs';

const env = { AI_SUMMARY_ENDPOINT: 'https://example.invalid/chat/completions', AI_SUMMARY_API_KEY: 'test-key', AI_SUMMARY_MODEL: 'configured-model' };
const record = (summary = '一段摘要。', generatedAt = '2026-01-01T00:00:00Z') => ({ summary, model: 'test-model', generatedAt });
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tonks-ai-summary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/content/posts'), { recursive: true });
  return root;
}
async function article(root, id, extra = '', body = '完整文章正文。') {
  const path = join(root, 'src/content/posts', `${id}.md`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `---\ntitle: 测试文章\npublished: 2026-01-01\n${extra}---\n${body}`);
}
const quiet = { env, log() {} };

test('CLI requires a single explicit article for force and rejects malformed arguments', () => {
  assert.deepEqual(parseArgs(['--', '--slug', 'notes/index', '--force']), { slug: 'notes/index', force: true, help: false });
  for (const args of [['--force'], ['--slug'], ['--slug', 'a', '--slug', 'b'], ['--unknown']]) assert.throws(() => parseArgs(args));
});

test('article reader preserves the entire Markdown body and resolves index/custom slugs', async t => {
  const root = await fixture(t);
  const body = '开头\n```js\nconst value = 1;\n```\n' + '完整内容。'.repeat(20000) + '\n最后一句。';
  await article(root, 'Notes/index', '', body);
  await article(root, 'other', 'slug: custom/path\n');
  await article(root, '中文目录/My Notes!');
  const articles = await readArticles(root);
  assert.equal(articles.find(a => a.id === 'Notes/index').slug, 'notes');
  assert.equal(articles.find(a => a.id === 'Notes/index').body, body);
  assert.equal(articles.find(a => a.id === 'other').slug, 'custom/path');
  assert.equal(articles.find(a => a.id === '中文目录/My Notes!').slug, '中文目录/my-notes');
});

test('normal generation skips existing legacy/object summaries, drafts and encrypted posts without requiring API credentials', async t => {
  const root = await fixture(t);
  await article(root, 'old'); await article(root, 'folder/index');
  await article(root, 'draft', 'draft: true\n'); await article(root, 'private', 'encrypted: true\n');
  const original = JSON.stringify({ old: '旧摘要原文。', 'folder/index': record() });
  await writeFile(join(root, SUMMARY_PATH), original);
  assert.equal(await runSummaries(root, {}, { env: {}, log() {}, generate() { assert.fail('must not request'); } }), 0);
  assert.equal(await readFile(join(root, SUMMARY_PATH), 'utf8'), original);
});

test('force covers a single draft/encrypted article and preserves unrelated records', async t => {
  const root = await fixture(t);
  await article(root, 'private/index', 'draft: true\nencrypted: true\n');
  const original = { 'private/index': record('旧摘要。'), unrelated: record('保留文字。') };
  await writeFile(join(root, SUMMARY_PATH), JSON.stringify(original));
  let calls = 0;
  assert.equal(await runSummaries(root, { slug: 'private', force: true }, { ...quiet, generate: async a => { calls++; assert.equal(a.id, 'private/index'); return record('新摘要。'); } }), 1);
  const saved = await readRecords(root);
  assert.equal(calls, 1);
  assert.equal(saved['private/index'].summary, '新摘要。');
  assert.deepEqual(saved.unrelated, original.unrelated);
  assert.equal(await runSummaries(root, { slug: 'private/index' }, { ...quiet, generate() { assert.fail(); } }), 0);
});

test('successful records survive a later failure and resume avoids repeating the paid request', async t => {
  const root = await fixture(t);
  await article(root, 'a'); await article(root, 'b');
  const firstCalls = [];
  await assert.rejects(runSummaries(root, {}, { ...quiet, generate: async a => { firstCalls.push(a.id); if (a.id === 'b') throw new Error('offline'); return record(); } }), /offline/);
  assert.deepEqual(firstCalls, ['a', 'b']);
  assert.deepEqual(Object.keys(await readRecords(root)), ['a']);
  const resumed = [];
  assert.equal(await runSummaries(root, {}, { ...quiet, generate: async a => { resumed.push(a.id); return record(); } }), 1);
  assert.deepEqual(resumed, ['b']);
});

test('failed force generation never destroys an existing summary', async t => {
  const root = await fixture(t); await article(root, 'a');
  const original = JSON.stringify({ a: record('必须保留。') });
  await writeFile(join(root, SUMMARY_PATH), original);
  await assert.rejects(runSummaries(root, { slug: 'a', force: true }, { ...quiet, generate: async () => { throw new Error('provider unavailable'); } }), /provider unavailable/);
  assert.equal(await readFile(join(root, SUMMARY_PATH), 'utf8'), original);
});

test('examples use newest ten distinct public summaries and exclude the current and private articles', () => {
  const articles = Array.from({ length: 15 }, (_, i) => ({ id: `a${i}`, slug: `a${i}` }));
  const records = Object.fromEntries(articles.map((a, i) => [a.id, record(`示例${i}`, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`)]));
  articles[14].draft = true; articles[13].encrypted = true;
  records.a11.summary = records.a10.summary;
  assert.deepEqual(examplesFor(records, articles, articles[12]), ['示例10', '示例9', '示例8', '示例7', '示例6', '示例5', '示例4', '示例3', '示例2', '示例1']);
});

test('summary validation enforces Unicode length and rejects format violations', () => {
  assert.equal(validateSummary(JSON.stringify({ summary: '𠮷'.repeat(160) })), '𠮷'.repeat(160));
  for (const value of [{ summary: '字'.repeat(161) }, { summary: '' }, { summary: '第一行\n第二行' }, { summary: '**粗体**' }, { summary: '链接 https://example.com' }, { summary: '表情🙂' }, { summary: '正文', extra: true }, ['正文'], null]) assert.throws(() => validateSummary(JSON.stringify(value)));
  assert.throws(() => validateSummary('```json\n{"summary":"内容"}\n```'));
});

test('request sends the full article, bounded format correction, and saves actual provider model', async () => {
  const body = '全文'.repeat(20000) + '结尾标记';
  const calls = [];
  const generated = await generateSummary({ title: '标题', body }, ['示例。'], configFromEnv(env), async (url, options) => {
    const payload = JSON.parse(options.body); calls.push(payload);
    assert.equal(url, env.AI_SUMMARY_ENDPOINT);
    assert.equal(options.redirect, 'error');
    assert.equal(JSON.parse(payload.messages[1].content).article.body, body);
    return { ok: true, json: async () => ({ model: 'provider-resolved-model', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary: calls.length === 1 ? '字'.repeat(161) : '合规摘要。' }) } }] }) };
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].messages.length, 3);
  assert.equal(generated.summary, '合规摘要。');
  assert.equal(generated.model, 'provider-resolved-model');
  assert.equal(generated.requestedModel, 'configured-model');
  assert.match(generated.contentHash, /^[a-f0-9]{64}$/);
});

test('invalid output retries at most three times and HTTP errors are sanitized', async () => {
  let requests = 0;
  await assert.rejects(generateSummary({ title: 't', body: 'b' }, [], configFromEnv(env), async () => {
    requests++; return { ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{"summary":"截断"}' } }] }) };
  }), /格式校验失败/);
  assert.equal(requests, 3);
  await assert.rejects(generateSummary({ title: 't', body: 'b' }, [], configFromEnv(env), async () => ({ ok: false, status: 401, json() { assert.fail('must not read secret-bearing body'); } })), error => /HTTP 401/.test(error.message) && !error.message.includes('test-key'));
});

test('concurrent generation is rejected while first task holds its lock; lock is released after completion', async t => {
  const root = await fixture(t); await article(root, 'a');
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const pending = runSummaries(root, {}, { ...quiet, generate: async () => { entered(); await new Promise(resolve => { release = resolve; }); return record(); } });
  await ready;
  await assert.rejects(runSummaries(root, {}, quiet), /另一个摘要任务正在运行/);
  release(); await pending;
  assert.equal(await runSummaries(root, {}, { ...quiet, env: {} }), 0);
  assert.deepEqual(await readdir(join(root, '.cache')), []);
});

test('external edits during generation cause refusal instead of overwriting and leave no temporary file', async t => {
  const root = await fixture(t); await article(root, 'a');
  const external = JSON.stringify({ other: record('外部修改。') });
  await assert.rejects(runSummaries(root, {}, { ...quiet, generate: async () => { await writeFile(join(root, SUMMARY_PATH), external); return record(); } }), /其他程序修改/);
  assert.equal(await readFile(join(root, SUMMARY_PATH), 'utf8'), external);
  assert.equal((await readdir(join(root, 'src/content'))).some(p => p.endsWith('.tmp')), false);
});

test('atomic records replacement produces valid complete JSON and refuses stale snapshots', async t => {
  const root = await fixture(t);
  const next = await writeRecords(root, { a: record('完整内容。') }, undefined);
  assert.equal(await readFile(join(root, SUMMARY_PATH), 'utf8'), next);
  await assert.rejects(writeRecords(root, { a: record('过期覆盖。') }, undefined), /其他程序修改/);
  assert.equal((await readRecords(root)).a.summary, '完整内容。');
  assert.equal((await readdir(join(root, 'src/content'))).some(p => p.endsWith('.tmp')), false);
});

test('ship runs generation before fingerprint/build and aborts the pipeline when generation fails', async t => {
  const root = await fixture(t);
  const scripts = join(root, 'scripts'); await mkdir(scripts);
  await writeFile(join(root, 'site-version.json'), '{}');
  await writeFile(join(scripts, 'run-build.mjs'), await readFile(new URL('./run-build.mjs', import.meta.url)));
  await writeFile(join(scripts, 'friend-avatars.mjs'), 'export async function reportFriendAvatars() {}');
  await writeFile(join(scripts, 'version-state.mjs'), 'export const readSiteVersion=()=>({}); export const selectVersion=()=>"test"; export const parseBuildArguments=()=>({deploy:true,bump:false});');
  await writeFile(join(scripts, 'production-validation.mjs'), 'export function sourceInventory(){throw Error("FINGERPRINT_SHOULD_NOT_RUN")} export const fingerprint=()=>""; export const sourceFingerprint=()=>""; export const inventory=()=>[];');
  await writeFile(join(scripts, 'run-ai-summary.mjs'), 'console.log("SUMMARY_FAILURE_SENTINEL"); process.exit(42);');
  const result = spawnSync(process.execPath, [join(scripts, 'run-build.mjs'), '--deploy'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /SUMMARY_FAILURE_SENTINEL/);
  assert.doesNotMatch(result.stderr, /FINGERPRINT_SHOULD_NOT_RUN/);
  assert.match(result.stderr, /run-ai-summary.mjs failed/);
});
