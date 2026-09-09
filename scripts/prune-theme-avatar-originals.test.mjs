import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { pruneAvatarOriginals } from './prune-theme-avatar-originals.mjs';

test('only unreferenced generated copies are pruned; sources and variants survive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'theme-avatar-prune-test-'));
  try {
    const source = join(root, 'source'), output = join(root, 'dist');
    await mkdir(source);
    await mkdir(join(output, '_astro'), { recursive: true });
    await writeFile(join(source, 'light.png'), 'light pixels');
    await writeFile(join(source, 'dark.png'), 'dark pixels');
    await writeFile(join(output, '_astro/light.hash.png'), 'light pixels');
    await writeFile(join(output, '_astro/dark.hash.png'), 'dark pixels');
    await writeFile(join(output, '_astro/light.variant.webp'), 'webp pixels');
    await writeFile(join(output, '_astro/light.other.png'), 'different pixels');
    await writeFile(join(output, 'index.html'), '<img src="/_astro/dark.hash.png">');
    assert.deepEqual(await pruneAvatarOriginals(source, output), { count: 1, bytes: 12 });
    await assert.rejects(access(join(output, '_astro/light.hash.png')));
    for (const f of ['_astro/dark.hash.png', '_astro/light.variant.webp', '_astro/light.other.png']) await access(join(output, f));
    await access(join(source, 'light.png'));
    assert.deepEqual(await pruneAvatarOriginals(source, output), { count: 0, bytes: 0 });
    assert.deepEqual(await pruneAvatarOriginals(join(root, 'missing'), output), { count: 0, bytes: 0 });
  } finally {
    await rm(root, { recursive: true, force: true }); // Exact test-owned mkdtemp directory.
  }
});
