// Astro emits imported originals alongside getImage variants. Remove only
// byte-identical, unreferenced theme-avatar copies from the generated asset dir.
import { createHash } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = data => createHash('sha256').update(data).digest('hex');
async function files(directory) {
  const result = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return result; throw error; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push(path); // Never follow symlinks.
  }
  return result;
}

export async function pruneAvatarOriginals(sourceDirectory, outputDirectory, assets = '_astro') {
  const sourceFiles = (await files(sourceDirectory)).filter(f => /\.(png|jpe?g)$/i.test(f));
  const sources = await Promise.all(sourceFiles.map(async path => ({
    stem: basename(path, extname(path)), extension: extname(path),
    hash: digest(await readFile(path)),
  })));
  if (!sources.length) return { count: 0, bytes: 0 };
  const candidates = [];
  for (const path of await files(join(outputDirectory, assets))) {
    const source = sources.find(s => basename(path).startsWith(s.stem + '.') && extname(path) === s.extension);
    if (!source) continue;
    const bytes = await readFile(path);
    if (digest(bytes) === source.hash) candidates.push({ path, bytes: bytes.length });
  }
  if (!candidates.length) return { count: 0, bytes: 0 };
  const referenced = new Set();
  for (const path of await files(outputDirectory)) {
    if (!/\.(html|js|mjs|css|json|map|svg|xml|txt)$/i.test(path)) continue;
    const text = await readFile(path, 'utf8');
    for (const candidate of candidates) {
      const name = basename(candidate.path);
      if (text.includes(name) || text.includes(encodeURIComponent(name))) referenced.add(candidate.path);
    }
  }
  const removed = candidates.filter(c => !referenced.has(c.path));
  for (const candidate of removed) await unlink(candidate.path);
  return { count: removed.length, bytes: removed.reduce((sum, c) => sum + c.bytes, 0) };
}

export default function pruneThemeAvatarOriginals() {
  let root, assets;
  return {
    name: 'prune-theme-avatar-originals',
    hooks: {
      'astro:config:done': ({ config }) => {
        root = fileURLToPath(new URL('src/assets/images/theme-avatar/', config.root));
        assets = config.build.assets;
      },
      'astro:build:done': async ({ dir, logger }) => {
        const result = await pruneAvatarOriginals(root, fileURLToPath(dir), assets);
        logger.info(`Removed ${result.count} unreferenced avatar originals (${result.bytes} bytes); source PNGs retained.`);
      },
    },
  };
}
