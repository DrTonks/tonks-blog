import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { exportImageAudit, validateOutput } from './export-image-audit.mjs';

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'blog-image-audit-'));
  const root = join(workspace, 'project');
  await mkdir(join(root, 'src/config'), { recursive: true });
  const cdn = await readFile(new URL('../src/config/cdn.ts', import.meta.url), 'utf8');
  await writeFile(join(root, 'src/config/cdn.ts'), cdn);
  const source = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#abcdef' } }).png().toBuffer();
  for (const match of cdn.matchAll(/'([^']+)':\s*`\$\{CDN_BASE\}/g)) {
    const path = join(root, 'public', match[1]);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, source);
  }
  return { workspace, root, cdn, source };
}

test('output boundary rejects project paths, Windows case variants and junctions, and never overwrites', async () => {
  const { workspace, root } = await fixture();
  try {
    for (const target of [root, root + '/', join(root, 'public/package'), join(root, 'public/../package'), ...(process.platform === 'win32' ? [root.toUpperCase(), join(root.toUpperCase(), 'PUBLIC/package')] : [])]) {
      await assert.rejects(exportImageAudit({ root, output: target }), /outside project/);
    }
    const link = join(workspace, 'outside-link');
    await symlink(join(root, 'public'), link, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      await assert.rejects(exportImageAudit({ root, output: join(link, 'package') }), /outside project/);
      await assert.rejects(lstat(join(root, 'public/package')), /ENOENT/);
    } finally { await rm(link); }
    assert.equal(await validateOutput(root, join(workspace, 'project-other')), join(workspace, 'project-other'));
    const existing = join(workspace, 'existing');
    await mkdir(existing);
    await writeFile(join(existing, 'keep.txt'), 'keep');
    await assert.rejects(exportImageAudit({ root, output: existing }), /EEXIST/);
    assert.equal(await readFile(join(existing, 'keep.txt'), 'utf8'), 'keep');
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('audit exports real config and JSON references, YAML covers, dynamic albums and valid CDN files', async () => {
  const { workspace, root, source } = await fixture();
  try {
    // Real management data, backed by small synthetic files: no full-site build
    // or costly re-encoding of the user's entire photo library is necessary.
    await mkdir(join(root, 'public/data'), { recursive: true });
    for (const name of ['projects', 'timeline']) {
      const text = await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8');
      await writeFile(join(root, `public/data/${name}.json`), text);
      for (const item of JSON.parse(text)) {
        for (const value of [item.image, item.images].flat()) {
          if (typeof value !== 'string' || !value.startsWith('/images/')) continue;
          const path = join(root, 'public', decodeURI(value));
          await mkdir(resolve(path, '..'), { recursive: true });
          await writeFile(path, source);
        }
      }
    }
    await mkdir(join(root, 'public/images/albums/demo'), { recursive: true });
    await mkdir(join(root, 'src/content/posts'), { recursive: true });
    await mkdir(join(root, 'public/images/covers'), { recursive: true });
    await writeFile(join(root, 'public/images/albums/demo/cover.jpg'), source);
    await writeFile(join(root, 'public/images/albums/demo/info.json'), JSON.stringify({ hidden: true, mode: 'local', cover: '/images/albums/demo/cover.jpg' }));
    await writeFile(join(root, 'public/images/covers/封面 #%.PNG'), source);
    await writeFile(join(root, 'src/content/posts/cover.md'), '---\nimage: >-\n  /images/covers/%E5%B0%81%E9%9D%A2%20%23%25.PNG\n---\n');
    await writeFile(join(root, 'public/data/escaped.json'), '{"image":"/images/covers/\\u5c01\\u9762 #%.PNG"}');
    await writeFile(join(root, 'public/data/invalid.json'), '{"image":"/images/covers/%ZZ.png"}');
    const output = join(workspace, 'package');
    const result = await exportImageAudit({ root, output });
    assert.equal(result.cdn.length, 11);
    assert.ok(result.diagnostics.some(item => item.message.includes('Invalid image reference')));
    for (const entry of result.cdn) {
      assert.match(entry.url, /^https:\/\/img\.tonks\.top\/blog\/.*\.webp$/);
      assert.ok(!entry.url.includes('\\'));
      assert.equal((await sharp(await readFile(join(output, 'upload', entry.key))).metadata()).format, 'webp');
      assert.deepEqual(await readFile(join(root, 'public', decodeURI(entry.source))), source);
    }
    const audit = JSON.parse(await readFile(join(output, 'local-reference-audit.json'), 'utf8'));
    assert.ok(audit.every(item => !item.url.includes('\\')));
    for (const name of ['projects', 'timeline']) {
      const data = JSON.parse(await readFile(join(root, `public/data/${name}.json`), 'utf8'));
      for (const item of data) for (const value of [item.image, item.images].flat()) {
        if (typeof value !== 'string' || !value.startsWith('/images/')) continue;
        const row = audit.find(entry => decodeURI(entry.url) === decodeURI(value));
        assert.ok(row?.references.some(ref => ref.file === `public/data/${name}.json`), `${name}: ${value}`);
      }
    }
    assert.equal(audit.find(item => item.url === '/images/projects/personalWebsite2.png').cdn, 'blog/personalWebsite2.webp');
    const cover = audit.find(item => item.url.includes('%E5%B0%81'));
    assert.ok(cover.references.some(ref => ref.file === 'src/content/posts/cover.md'));
    // '#' in a raw URL is a fragment; use encoded form for unambiguous references.
    const album = audit.find(item => item.url === '/images/albums/demo/cover.jpg');
    assert.equal(album.album.hidden, true);
    assert.ok(album.dynamicAlbum);
    assert.ok(album.references.some(ref => ref.file.endsWith('/info.json')));
    assert.match(await readFile(join(output, 'local-reference-audit.md'), 'utf8'), /不得据此删除原图/);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test('malformed or escaping CDN URLs are rejected before creating an upload directory', async () => {
  const { workspace, root, cdn } = await fixture();
  try {
    for (const bad of ['/../../escape.webp', '/%2e%2e/escape.webp', '/%5cescape.webp', '/broken%ZZ.webp', '/banner/a?query.webp', '/banner/a#fragment.webp']) {
      await writeFile(join(root, 'src/config/cdn.ts'), cdn.replace('/left.webp', bad));
      const output = join(workspace, 'package');
      await assert.rejects(exportImageAudit({ root, output }), /Invalid CDN key/);
      await assert.rejects(lstat(output), /ENOENT/);
    }
  } finally { await rm(workspace, { recursive: true, force: true }); }
});
