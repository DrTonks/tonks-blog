import { readdir, readFile, mkdir, writeFile, copyFile, stat, rename } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const result = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) result.push(...await walk(path));
    else if (e.isFile()) result.push(path);
  }
  return result.sort();
}

export async function generateImages(root) {
  const checkReference = async value => {
    if (typeof value !== 'string' || !value.startsWith('/images/')) return;
    const path = decodeURI(value.split(/[?#]/)[0]);
    if (path.split('/').includes('..') || path.includes('\\')) throw new Error(`Invalid image reference: ${value}`);
    try { await stat(join(root, 'public', path)); }
    catch { throw new Error(`Image source not found: ${value}`); }
  };
  for (const name of ['projects', 'timeline']) {
    let data;
    try { data = await readFile(join(root, 'public/data', name + '.json'), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    for (const entry of JSON.parse(data)) {
      for (const src of Array.isArray(entry.image) ? entry.image : [entry.image]) await checkReference(src);
    }
  }
  for (const post of await walk(join(root, 'src/content/posts'))) {
    if (!/\.mdx?$/.test(post)) continue;
    const text = await readFile(post, 'utf8');
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const cover = frontmatter?.[1].match(/^image:\s*(.*?)\s*$/m)?.[1];
    if (cover) await checkReference(cover.replace(/^['"]|['"]$/g, ''));
  }
  const cache = join(root, 'node_modules/.cache/blog-images');
  await mkdir(cache, { recursive: true });
  const manifest = {}, outputs = new Map();
  const started = performance.now();
  let encoded = 0;
  for (const group of ['albums', 'projects', 'covers']) {
    for (const path of await walk(join(root, 'public/images', group))) {
      if (!/\.(png|jpe?g)$/i.test(path)) continue;
      const input = await readFile(path);
      const metadata = await sharp(input).metadata();
      if ((metadata.pages || 1) > 1) continue;
      const original = '/' + relative(join(root, 'public'), path);
      const entry = { original, originalBytes: input.length };
      // Keep full-resolution display for zoom; thumbnail bounds only affect cards.
      for (const kind of ['thumbnail', 'display']) {
        const size = kind === 'thumbnail' ? Math.min(800, Math.max(metadata.width, metadata.height)) : Math.max(metadata.width, metadata.height);
        const quality = group === 'projects' ? 90 : 85;
        const id = hash(Buffer.concat([input, Buffer.from(`v1:${size}:${quality}:${sharp.versions.sharp}`)]));
        const name = `${id}.webp`, target = join(cache, name);
        try { await stat(target); }
        catch {
          const data = await sharp(input).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
          const temporary = target + '.' + process.pid + '.tmp';
          await writeFile(temporary, data);
          await rename(temporary, target); encoded++;
        }
        const bytes = (await stat(target)).size;
        entry[kind] = bytes < input.length ? `/_images/${name}` : original;
        entry[`${kind}Bytes`] = Math.min(bytes, input.length);
        if (bytes < input.length) outputs.set(name, target);
      }
      manifest[original] = entry;
    }
  }
  return { manifest, outputs, encoded, ms: performance.now() - started };
}

export default function optimizedImages() {
  let result;
  return { name: 'optimized-public-images', hooks: {
    'astro:config:setup': async ({ config, updateConfig, logger }) => {
      result = await generateImages(fileURLToPath(config.root));
      logger.info(`${Object.keys(result.manifest).length} sources, ${result.encoded} encodes, ${Math.round(result.ms)}ms`);
      updateConfig({ vite: { plugins: [{
        name: 'optimized-image-manifest',
        resolveId(id) { if (id === 'virtual:optimized-images') return '\0optimized-images'; },
        load(id) {
          if (id === '\0optimized-images') {
            const urls = Object.fromEntries(Object.entries(result.manifest).map(([key, value]) => [key, { thumbnail: value.thumbnail, display: value.display }]));
            return `export default ${JSON.stringify(urls)}`;
          }
        },
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const pathname = (req.url || '').split('?')[0];
            const name = pathname.slice('/_images/'.length);
            if (!pathname.startsWith('/_images/') || !result.outputs.has(name)) return next();
            res.setHeader('Content-Type', 'image/webp');
            res.end(await readFile(result.outputs.get(name)));
          });
        },
      }] } });
    },
    'astro:build:done': async ({ dir }) => {
      const out = join(fileURLToPath(dir), '_images');
      await mkdir(out, { recursive: true });
      for (const [name, source] of result.outputs) await copyFile(source, join(out, name));
      await writeFile(join(out, 'manifest.json'), JSON.stringify(result.manifest));
    },
  } };
}
