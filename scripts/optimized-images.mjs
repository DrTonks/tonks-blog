import { readFile, mkdir, writeFile, copyFile, stat, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { readContentData } from './content-data.mjs';
import { walk, fileKey, encodePath, frontmatter, localImagePath, isWithin } from './image-pipeline-utils.mjs';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
const virtualId = '\0optimized-images';

export async function generateImages(root, { strict = true } = {}) {
  const warnings = [];
  const failedSources = new Set();
  const attempt = async (action, onError) => {
    try { return await action(); }
    catch (error) {
      if (strict) throw error;
      warnings.push(error.message);
      await onError?.();
    }
  };
  const checkReference = async value => {
    const path = localImagePath(value);
    if (!path) return;
    let info;
    try { info = await stat(join(root, 'public', path)); }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    if (!info?.isFile()) throw new Error(`Image source not found: ${value}`);
  };
  for (const name of ['projects', 'timeline']) {
    await attempt(async () => {
      let data;
      try { data = await readContentData(root, name); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      for (const entry of data) {
        for (const value of [entry.image, entry.images].flat()) await checkReference(value);
      }
    });
  }
  for (const post of await walk(join(root, 'src/content/posts'))) {
    if (!/\.mdx?$/i.test(post)) continue;
    await attempt(async () => {
      const data = frontmatter(await readFile(post, 'utf8'), post);
      if (typeof data.image === 'string') await checkReference(data.image.trim());
    });
  }
  // Do not write into node_modules: it can be a shared junction in review copies.
  const cache = join(root, '.cache/blog-images');
  await mkdir(cache, { recursive: true });
  const manifest = {}, outputs = new Map();
  const started = performance.now();
  let encoded = 0;
  for (const group of ['albums', 'projects', 'covers']) {
    for (const path of await walk(join(root, 'public/images', group))) {
      if (!/\.(png|jpe?g)$/i.test(path)) continue;
      await attempt(async () => {
        const input = await readFile(path);
        const metadata = await sharp(input).metadata();
        if ((metadata.pages || 1) > 1) return;
        const key = fileKey(join(root, 'public'), path);
        const original = encodePath(key);
        const entry = { original, originalBytes: input.length };
        const generated = new Map();
        // Full-resolution display for zoom; only card thumbnails are bounded.
        for (const kind of ['thumbnail', 'display']) {
          const size = kind === 'thumbnail' ? Math.min(800, Math.max(metadata.width, metadata.height)) : Math.max(metadata.width, metadata.height);
          const quality = group === 'projects' ? 90 : 85;
          const id = hash(Buffer.concat([input, Buffer.from(`v1:${size}:${quality}:${sharp.versions.sharp}`)]));
          const name = `${id}.webp`, target = join(cache, name);
          try { await stat(target); }
          catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const data = await sharp(input).rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
            const temporary = target + '.' + randomUUID() + '.tmp';
            await writeFile(temporary, data);
            await rename(temporary, target); encoded++;
          }
          const bytes = (await stat(target)).size;
          entry[kind] = bytes < input.length ? `/_images/${name}` : original;
          entry[`${kind}Bytes`] = Math.min(bytes, input.length);
          if (bytes < input.length) generated.set(name, target);
        }
        manifest[key] = entry;
        for (const [name, target] of generated) outputs.set(name, target);
      }, async () => {
        // A partial write/temporary read failure is not an unlink. Let dev keep
        // the last successful entry until this existing file becomes readable.
        const exists = await stat(path).then(info => info.isFile(), error => {
          return error.code !== 'ENOENT' && error.code !== 'ENOTDIR';
        });
        if (exists) failedSources.add(fileKey(join(root, 'public'), path));
      });
    }
  }
  return { manifest, outputs, encoded, ms: performance.now() - started, warnings, failedSources };
}

export default function optimizedImages() {
  let result;
  return { name: 'optimized-public-images', hooks: {
    'astro:config:setup': async ({ config, updateConfig, logger, command }) => {
      const root = fileURLToPath(config.root);
      const strict = command !== 'dev';
      result = await generateImages(root, { strict });
      const report = current => {
        logger.info(`${Object.keys(current.manifest).length} sources, ${current.encoded} encodes, ${Math.round(current.ms)}ms`);
        for (const warning of current.warnings) logger.warn(warning);
      };
      report(result);
      let pending = Promise.resolve();
      let cleanup = () => {};
      updateConfig({ vite: { plugins: [{
        name: 'optimized-image-manifest',
        resolveId(id) { if (id === 'virtual:optimized-images') return virtualId; },
        async load(id) {
          if (id === virtualId) {
            await pending;
            const urls = Object.fromEntries(Object.entries(result.manifest).map(([key, value]) => [key, { thumbnail: value.thumbnail, display: value.display }]));
            return `export default ${JSON.stringify(urls)}`;
          }
        },
        configureServer(server) {
          let revision = 0, running = false, closed = false;
          // Keep at most the previous and current URLs for each live source. A
          // deleted source loses ALL its hashes; identical surviving sources
          // can still own the same content-addressed asset.
          let histories = new Map();
          let served = new Map();
          const publish = next => {
            for (const key of next.failedSources) {
              const previous = result.manifest[key];
              if (!previous) continue;
              next.manifest[key] = previous;
              for (const kind of ['thumbnail', 'display']) {
                const name = previous[kind].slice('/_images/'.length);
                if (result.outputs.has(name)) next.outputs.set(name, result.outputs.get(name));
              }
            }
            const nextHistories = new Map(), nextServed = new Map();
            for (const [key, entry] of Object.entries(next.manifest)) {
              const current = new Map();
              for (const kind of ['thumbnail', 'display']) {
                const name = entry[kind].slice('/_images/'.length);
                if (next.outputs.has(name)) current.set(name, next.outputs.get(name));
              }
              const previous = histories.get(key)?.at(-1);
              const versions = previous
                ? ([...previous.keys()].join() !== [...current.keys()].join() ? [previous, current] : histories.get(key))
                : [current];
              nextHistories.set(key, versions);
              for (const version of versions) for (const [name, path] of version) nextServed.set(name, path);
            }
            histories = nextHistories;
            served = nextServed;
            result = next;
          };
          publish(result);
          const relevant = path => {
            const absolute = resolve(path);
            return isWithin(join(root, 'public/images'), absolute)
              || (isWithin(join(root, 'src/data'), absolute) && /\.ts$/i.test(path))
              || isWithin(join(root, 'src/content/posts'), absolute);
          };
          const changed = (event, path) => {
            if (closed || !['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event) || !relevant(path)) return;
            revision++;
            if (running) return;
            running = true;
            pending = (async () => {
              try {
                let completed;
                do {
                  completed = revision;
                  const next = await generateImages(root, { strict: false });
                  if (closed) return;
                  if (completed !== revision) continue; // Never publish a stale scan.
                  publish(next);
                  report(next);
                  // Album scanners and build-time data readers aren't module imports.
                  // Invalidate SSR importers too, then reload clients AFTER commit.
                  server.moduleGraph.invalidateAll();
                  server.ws.send({ type: 'full-reload', path: '*' });
                } while (completed !== revision);
              } catch (error) {
                logger.error(`Image refresh failed: ${error.message}`);
                server.ws.send({ type: 'error', err: { message: error.message, stack: error.stack } });
              } finally { running = false; }
            })();
          };
          server.watcher.add([join(root, 'public/images'), join(root, 'src/data'), join(root, 'src/content/posts')]);
          server.watcher.on('all', changed);
          const rescan = () => changed('change', join(root, 'public/images'));
          // config:setup can precede watcher registration by seconds. Close that
          // gap before the first virtual load; rescan again when initial watcher
          // discovery finishes, covering changes made while it was discovering.
          server.watcher.once('ready', rescan);
          rescan();
          // Vite closes the plugin container in both HTTP and middleware mode.
          cleanup = () => { closed = true; server.watcher.off('all', changed); server.watcher.off('ready', rescan); };
          server.middlewares.use(async (req, res, next) => {
            const pathname = (req.url || '').split(/[?#]/)[0];
            if (!pathname.startsWith('/_images/')) return next();
            await pending;
            const source = served.get(pathname.slice('/_images/'.length));
            if (!source) { res.statusCode = 404; res.end('Image not found'); return; }
            try {
              const bytes = await readFile(source);
              res.setHeader('Content-Type', 'image/webp');
              res.setHeader('Cache-Control', 'no-store');
              res.end(bytes);
            } catch (error) { next(error); }
          });
        },
        closeBundle() { cleanup(); },
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
