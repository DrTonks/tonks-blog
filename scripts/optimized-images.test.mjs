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
