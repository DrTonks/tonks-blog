import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
const utilityModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL('../src/utils/friend-reading.ts', import.meta.url), 'utf8'),
  { compilerOptions },
).outputText, { exports: utilityModule.exports });

// Execute the actual client with a small DOM adapter and deterministic responses.
// Expose its initial async task so every assertion runs after polling completes.
const clientSource = readFileSync(new URL('../src/scripts/friend-reading.ts', import.meta.url), 'utf8');
assert.ok(clientSource.includes('void initializeDailyRead();'));
const clientCode = ts.transpileModule(clientSource
  .replace('import.meta.env.PUBLIC_SLEEPY_API_BASE', 'undefined')
  .replace('void initializeDailyRead();', 'globalThis.initialization = initializeDailyRead();'),
{ compilerOptions }).outputText;

const article = (feedUrl, ageDays = 0) => ({
  feedUrl,
  url: `https://example.org/posts/${feedUrl}`,
  title: `Article ${feedUrl}`,
  summary: `Summary ${feedUrl}`,
  publishedAt: new Date(Date.now() - ageDays * 86400000).toISOString(),
});

async function runClient(responses) {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: '', hidden: true, disabled: true, listeners: new Map(),
      addEventListener(event, listener) { this.listeners.set(event, listener); },
      removeAttribute(attribute) { delete this[attribute]; },
    });
    return nodes.get(selector);
  }
  const card = {
    isConnected: true,
    dataset: { friends: JSON.stringify(['a', 'b'].map(name => ({
      name, rss: name, url: `https://example.org/${name}`,
    }))) },
    querySelector: node,
    querySelectorAll: () => [node('[data-daily-link]'), node('[data-daily-read-link]')],
  };
  const snapshot = () => ({
    title: node('[data-daily-title]').textContent,
    href: node('[data-daily-link]').href,
    disabled: node('[data-daily-refresh]').disabled,
  });
  const intermediate = [];
  let fetches = 0;
  const context = vm.createContext({
    exports: {},
    require(specifier) {
      assert.equal(specifier, '../utils/friend-reading');
      return utilityModule.exports;
    },
    URL, AbortSignal,
    document: { querySelector: () => card, querySelectorAll: () => [], addEventListener() {} },
    window: {},
    matchMedia: () => ({ matches: true }),
    fetch: async () => {
      const response = responses[fetches++];
      assert.ok(response, 'client must not request an unexpected extra response');
      return { ok: true, json: async () => ({ schema: 1, ...response }) };
    },
    setTimeout(callback) { intermediate.push(snapshot()); callback(); },
  });
  vm.runInContext(clientCode, context);
  await context.initialization;
  assert.equal(fetches, responses.length);
  return { node, intermediate, snapshot };
}

test('pending one-to-two candidates enables refresh without replacing the current article', async () => {
  const a = article('a');
  const b = article('b');
  const client = await runClient([
    { pending: true, articles: [a] },
    { pending: false, articles: [a, b] },
  ]);
  assert.deepEqual(client.intermediate, [{ title: a.title, href: a.url, disabled: true }]);
  assert.deepEqual(client.snapshot(), { title: a.title, href: a.url, disabled: false });
  client.node('[data-daily-refresh]').listeners.get('click')();
  assert.deepEqual(client.snapshot(), { title: b.title, href: b.url, disabled: false });
});

test('a refreshed manifest excluding the current feed replaces its displayed article', async () => {
  const a = article('a');
  const b = article('b');
  const client = await runClient([
    { pending: true, articles: [a] },
    { pending: false, articles: [b] },
  ]);
  assert.equal(client.intermediate[0].title, a.title);
  assert.deepEqual(client.snapshot(), { title: b.title, href: b.url, disabled: true });
  assert.equal(client.node('[data-daily-site]').textContent, 'b');
});

test('losing the last eligible article clears its links and source instead of leaving an old target', async () => {
  const client = await runClient([
    { pending: true, articles: [article('a')] },
    { pending: false, articles: [article('b', 8)] },
  ]);
  assert.equal(client.snapshot().disabled, true);
  assert.equal(client.snapshot().href, undefined);
  assert.equal(client.node('[data-daily-read-link]').href, undefined);
  assert.equal(client.node('[data-daily-read-link]').hidden, true);
  assert.equal(client.node('[data-daily-source]').hidden, true);
  assert.equal(client.snapshot().title, '这周，朋友们还没有新文章');
});
