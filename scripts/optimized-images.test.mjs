import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { generateImages } from './optimized-images.mjs';

test('new/replaced/deleted sources, cache and original preservation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-image-test-'));
  try {
    const dir = join(root, 'public/images/projects');
    await mkdir(dir, { recursive: true });
    const source = await sharp({ create: { width: 1000, height: 1000, channels: 4, background: '#abcdef' } }).png().toBuffer();
    const path = join(dir, 'New.PNG');
    await writeFile(path, source);
    const first = await generateImages(root);
    assert.equal(Object.keys(first.manifest).length, 1);
    const entry = first.manifest['/images/projects/New.PNG'];
    assert.ok(entry.thumbnailBytes <= source.length);
    assert.ok(entry.displayBytes <= source.length);
    assert.deepEqual(await readFile(path), source);
    assert.equal((await generateImages(root)).encoded, 0);
    const changed = await sharp(source).tint('#ff3300').png().toBuffer();
    await writeFile(path, changed);
    assert.notEqual((await generateImages(root)).manifest[entry.original].thumbnail, entry.thumbnail);
    await rm(path);
    const removed = await generateImages(root);
    assert.equal(Object.keys(removed.manifest).length, 0);
    assert.equal(removed.outputs.size, 0); // Old cache files are not deployed.
    await mkdir(join(root, 'public/data'), { recursive: true });
    await writeFile(join(root, 'public/data/projects.json'), JSON.stringify([{ image: '/images/projects/missing.png' }]));
    await assert.rejects(generateImages(root), /Image source not found/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import optimizedImages from './optimized-images.mjs';
const require = createRequire(import.meta.url);
const astroRequire = createRequire(require.resolve('astro/package.json'));
const { createServer } = await import(pathToFileURL(astroRequire.resolve('vite')).href);
const makeImage = color => sharp({ create: { width: 1000, height: 1000, channels: 4, background: color } }).png().toBuffer();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  const limit = Date.now() + 12000;
  while (Date.now() < limit) { if (await check()) return; await pause(40); }
  assert.fail(`Timed out: ${label}`);
}

test('YAML frontmatter and encoded image references use the real parser', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-yaml-test-'));
  try {
    await mkdir(join(root, 'public/images/covers'), { recursive: true });
    await mkdir(join(root, 'src/content/posts'), { recursive: true });
    await writeFile(join(root, 'public/images/covers/中文 #%.PNG'), await makeImage('#abcdef'));
    const url = '/images/covers/%E4%B8%AD%E6%96%87%20%23%25.PNG';
    const cases = [
      `image: ${url} # cover`, `image: "${url}" # cover`, `image: '${url}' # cover`,
      `image: >-\n  ${url}`, `image: |\n  ${url}`, `cover: &cover '${url}'\nimage: *cover`,
      'image: null', 'image: "https://example.com/remote.png"',
    ];
    for (const [i, yaml] of cases.entries()) await writeFile(join(root, `src/content/posts/${i}.md`), `\uFEFF---\r\n${yaml.replaceAll('\n', '\r\n')}\r\n---\r\nbody`);
    const result = await generateImages(root);
    assert.match(result.manifest['/images/covers/中文 #%.PNG'].thumbnail, /^\/_images\//);
    assert.ok(Object.keys(result.manifest).every(key => !key.includes('\\')));
    const bad = join(root, 'src/content/posts/bad.md');
    for (const value of ['/images/covers/missing.png', '/images/covers/%ZZ.png', '/images/covers/%2e%2e/x.png', '/images/covers/a%5Cb.png', '/images/covers/a%2Fb.png']) {
      await writeFile(bad, `---\nimage: '${value}'\n---\n`);
      await assert.rejects(generateImages(root), /Image source not found|Invalid image reference/);
    }
    await writeFile(bad, '---\nimage: [\n---\n');
    await assert.rejects(generateImages(root), /unexpected end/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real Vite watcher updates SSR/client manifest, reloads JSON and retires deleted hashes', { timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-image-vite-'));
  let server, socket;
  try {
    await mkdir(join(root, 'public/images/projects'), { recursive: true });
    await mkdir(join(root, 'public/images/albums/demo'), { recursive: true });
    await mkdir(join(root, 'public/data'), { recursive: true });
    await mkdir(join(root, 'src/utils'), { recursive: true });
    await mkdir(join(root, 'src/content/posts'), { recursive: true });
    await writeFile(join(root, 'src/utils/optimized-image.ts'), await readFile(new URL('../src/utils/optimized-image.ts', import.meta.url)));
    await writeFile(join(root, 'cdn.ts'), await readFile(new URL('../src/config/cdn.ts', import.meta.url)));
    await writeFile(join(root, 'entry.ts'), `import manifest from 'virtual:optimized-images'; export { optimizedImage } from './src/utils/optimized-image'; export default manifest;`);
    const original = '/images/projects/personalWebsite2.png';
    const source = join(root, 'public', original);
    const initialBytes = await makeImage('#abcdef');
    await writeFile(source, initialBytes);
    const dataPath = join(root, 'public/data/projects.json');
    await writeFile(dataPath, JSON.stringify([{ image: original }]));
    const integration = optimizedImages();
    let config;
    const warnings = [];
    await integration.hooks['astro:config:setup']({ config: { root: pathToFileURL(root + '/') }, command: 'dev', updateConfig: value => { config = value; }, logger: { info() {}, warn(message) { warnings.push(message); }, error(message) { warnings.push(message); } } });
    server = await createServer({ configFile: false, root, cacheDir: join(root, '.vite'), plugins: config.vite.plugins, logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const reloads = [];
    socket = new WebSocket(base.replace('http:', 'ws:'), 'vite-hmr');
    socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.type === 'full-reload') reloads.push(message); });
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const entry = () => server.ssrLoadModule('/entry.ts');
    const first = await entry();
    const oldUrl = first.optimizedImage(original);
    assert.match(oldUrl, /^\/_images\/[\da-f]+\.webp$/);
    const firstResponse = await fetch(base + oldUrl);
    assert.equal(firstResponse.status, 200);
    assert.equal((await sharp(Buffer.from(await firstResponse.arrayBuffer())).metadata()).format, 'webp');
    assert.equal((await fetch(base + original)).status, 200);
    assert.match(await (await fetch(base + '/entry.ts')).text(), /\/@id\/__x00__optimized-images/);
    assert.ok((await (await fetch(base + '/@id/__x00__optimized-images')).text()).includes(oldUrl));
    for (const value of ['/images/user-added.gif', '/images/stickers/new.png', 'https://cdn.example/new.jpg', '/assets/home/left.png', '/images/projects/%ZZ.png']) assert.equal(first.optimizedImage(value), value);
    const cdn = await server.ssrLoadModule('/cdn.ts');
    assert.equal(cdn.getLocalFallback(cdn.getCdnUrl(original)), original);
    cdn.setCdnFailed(true);
    assert.equal(first.optimizedImage(cdn.getImageUrl(original)), oldUrl);

    // Change on disk, without invoking generator/plugin callbacks manually.
    await writeFile(source, await makeImage('#ff3300'));
    await until(async () => (await entry()).optimizedImage(original) !== oldUrl, 'replaced image reaches SSR');
    const newUrl = (await entry()).optimizedImage(original);
    assert.match(newUrl, /^\/_images\//);
    assert.equal((await fetch(base + newUrl)).status, 200);
    assert.equal((await fetch(base + oldUrl)).status, 200, 'in-flight old URL survives replacement');
    assert.ok((await (await fetch(base + '/@id/__x00__optimized-images')).text()).includes(newUrl));
    await until(() => reloads.length > 0, 'HMR websocket reload');

    const warningCount = warnings.length;
    await writeFile(source, initialBytes.subarray(0, 8));
    await until(() => warnings.length > warningCount, 'partial image warning');
    assert.equal((await entry()).optimizedImage(original), newUrl, 'partial file retains last successful manifest');
    for (const url of [oldUrl, newUrl]) assert.equal((await fetch(base + url)).status, 200, 'partial file retains successful history');
    await writeFile(source, await makeImage('#bb33cc'));
    await until(async () => (await entry()).optimizedImage(original) !== newUrl, 'partial image recovers');
    const recoveredUrl = (await entry()).optimizedImage(original);
    assert.equal((await fetch(base + recoveredUrl)).status, 200);
    assert.equal((await fetch(base + newUrl)).status, 200, 'last successful URL survives recovery');

    const added = '/images/projects/中文 新.PNG';
    await writeFile(join(root, 'public', added), await makeImage('#00aaff'));
    await until(async () => Boolean((await entry()).default[added]), 'added file');
    assert.equal((await entry()).optimizedImage(encodeURI(added) + '?v=2#zoom'), (await entry()).optimizedImage(added) + '?v=2#zoom');
    let count = reloads.length;
    await writeFile(dataPath, JSON.stringify([{ image: added }]));
    await until(() => reloads.length > count, 'project JSON reload');
    count = reloads.length;
    await writeFile(join(root, 'public/data/timeline.json'), JSON.stringify([{ images: [added] }]));
    await until(() => reloads.length > count, 'new timeline JSON reload');
    count = reloads.length;
    await writeFile(join(root, 'public/images/albums/demo/info.json'), JSON.stringify({ hidden: true, mode: 'external', cover: 'https://example.com/cover.jpg' }));
    await until(() => reloads.length > count, 'album metadata reload');
    count = reloads.length;
    await rm(join(root, 'public/data/timeline.json'));
    await until(() => reloads.length > count, 'JSON deletion reload');

    // Rapid saves + a partial JSON write must recover to the final disk state.
    await writeFile(dataPath, '[');
    await until(() => warnings.some(message => /JSON/.test(message)), 'partial JSON warning');
    await writeFile(source, await makeImage('#111111'));
    await writeFile(source, await makeImage('#22cc55'));
    await writeFile(dataPath, JSON.stringify([{ image: original }]));
    const expected = (await generateImages(root)).manifest[original].thumbnail;
    await until(async () => (await entry()).optimizedImage(original) === expected, 'rapid final replacement');
    // Delete while JSON still references it: dev must discard it, not freeze.
    await rm(source);
    await until(async () => !(await entry()).default[original], 'deleted source removed from manifest');
    for (const url of [oldUrl, newUrl, recoveredUrl, expected]) assert.equal((await fetch(base + url)).status, 404);
    assert.equal((await entry()).optimizedImage(original), original);
    assert.ok(warnings.some(message => message.includes('Image source not found')));
    assert.deepEqual(await readFile(join(root, 'public', added)), await makeImage('#00aaff'));
  } finally {
    socket?.close();
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('first virtual load includes edits made between config setup and watcher registration', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'blog-image-startup-'));
  let server;
  try {
    const source = join(root, 'public/images/projects/start.png');
    await mkdir(join(root, 'public/images/projects'), { recursive: true });
    await writeFile(source, await makeImage('#abcdef'));
    const integration = optimizedImages();
    let config;
    await integration.hooks['astro:config:setup']({ config: { root: pathToFileURL(root + '/') }, command: 'dev', updateConfig: value => { config = value; }, logger: { info() {}, warn() {}, error() {} } });
    const before = await config.vite.plugins[0].load('\0optimized-images');
    // No watcher exists yet, so the OS cannot deliver this edit to the plugin.
    await writeFile(source, await makeImage('#11ff22'));
    server = await createServer({ configFile: false, root, cacheDir: join(root, '.vite'), plugins: config.vite.plugins, logLevel: 'silent', optimizeDeps: { noDiscovery: true, include: [] }, server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const first = await server.ssrLoadModule('virtual:optimized-images');
    const url = first.default['/images/projects/start.png'].thumbnail;
    assert.ok(!before.includes(url), 'the FIRST load must wait for the post-registration scan');
    assert.equal((await fetch(base + url)).status, 200);
    assert.ok((await (await fetch(base + '/@id/__x00__optimized-images')).text()).includes(url));
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
