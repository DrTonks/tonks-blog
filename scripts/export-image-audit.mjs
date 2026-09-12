// Reproducible, non-destructive export. Never uploads or changes site URLs.
import { readFile, mkdir, writeFile, stat, realpath } from 'node:fs/promises';
import { resolve, relative, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { readContentData } from './content-data.mjs';
import { walk, slash, fileKey, encodePath, isWithin, localImagePath, frontmatter } from './image-pipeline-utils.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

// Resolve existing ancestors, including Windows junctions. Lexical containment
// alone does not catch an outside directory that links back into the project.
async function physicalPath(path) {
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await physicalPath(parent), basename(path));
  }
}

export async function validateOutput(root, output) {
  root = resolve(root);
  output = resolve(output);
  if (isWithin(root, output) || isWithin(await realpath(root), await physicalPath(output))) {
    throw new Error('Export must be outside project');
  }
  return output;
}

function objectKey(value) {
  // Keys are decoded filesystem paths internally; URLs are encoded per segment.
  const parts = value.split('/').map(part => {
    let decoded;
    try { decoded = decodeURIComponent(part); } catch { throw new Error(`Invalid CDN key: ${value}`); }
    if (!decoded || decoded === '.' || decoded === '..' || /[\\/:?#\u0000-\u001f]/.test(decoded)) throw new Error(`Invalid CDN key: ${value}`);
    return decoded;
  });
  return parts.join('/');
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

export async function exportImageAudit({ root = projectRoot, output = join(root, '../blog-image-webp-upload') } = {}) {
  root = resolve(root);
  output = await validateOutput(root, output);
  const cdnText = await readFile(join(root, 'src/config/cdn.ts'), 'utf8');
  const baseText = cdnText.match(/export const CDN_BASE\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if (!baseText || !/^https:\/\//.test(baseText)) throw new Error('Invalid CDN base URL');
  const base = new URL(baseText);
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid CDN base URL');
  const baseKey = objectKey(base.pathname.replace(/^\//, '').replace(/\/$/, ''));
  const cdn = [...cdnText.matchAll(/'([^']+)':\s*`\$\{CDN_BASE\}([^`]+)`/g)].map(m => {
    // The mapping also includes /assets/, which uses the same URL rules.
    const local = localImagePath(m[1].replace(/^\/assets\//, '/images/'));
    if (!local || /[?#]/.test(m[1])) throw new Error(`Invalid CDN source: ${m[1]}`);
    const key = objectKey(baseKey + m[2]);
    const decodedLocal = m[1].startsWith('/assets/') ? local.replace(/^\/images\//, '/assets/') : local;
    return { local: decodedLocal, key };
  });
  if (cdn.length !== 11 || new Set(cdn.map(entry => entry.key)).size !== cdn.length) throw new Error('CDN configuration changed; review export mapping before proceeding');
  // All path/URL guards run before any output is created. Never overwrite a package.
  await mkdir(output);
  const manifest = [];
  for (const entry of cdn) {
    const input = join(root, 'public', entry.local);
    const meta = await sharp(input).metadata();
    if ((meta.pages || 1) > 1) throw new Error(`Animated input requires review: ${entry.local}`);
    const key = entry.key.replace(/\.[^.]+$/, '.webp');
    const target = join(output, 'upload', key);
    await mkdir(dirname(target), { recursive: true });
    await sharp(input).rotate().webp({ quality: 85 }).toFile(target);
    const bytes = await readFile(target);
    manifest.push({ source: encodePath(entry.local), oldKey: entry.key, key, url: `${base.origin}/${encodePath(key)}`, originalBytes: (await stat(input)).size, webpBytes: bytes.length, width: meta.width, height: meta.height, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(join(output, 'cdn-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const sourceFiles = (await Promise.all(['src', 'public', 'scripts'].map(d => walk(join(root, d))))).flat().filter(p => /\.(astro|svelte|[cm]?[jt]sx?|json|mdx?|css|html|ya?ml)$/i.test(p) && p !== fileURLToPath(import.meta.url));
  const diagnostics = [];
  const texts = await Promise.all(sourceFiles.map(async path => {
    const text = await readFile(path, 'utf8'), file = slash(relative(root, path));
    const parsed = new Set();
    try {
      const contentName = file.match(/^src\/data\/(projects|timeline|friends|construction)\.ts$/)?.[1];
      const data = contentName ? await readContentData(root, contentName)
        : /\.json$/i.test(path) ? JSON.parse(text) : /\.mdx?$/i.test(path) ? frontmatter(text, path) : null;
      for (const value of strings(data)) {
        try { const key = localImagePath(value.trim()); if (key) parsed.add(key); }
        catch (error) { diagnostics.push({ file, message: error.message }); }
      }
    } catch (error) { diagnostics.push({ file, message: error.message }); }
    return { file, text, parsed };
  }));
  const images = (await Promise.all(['public/images', 'public/assets/home', 'public/assets/desktop-banner', 'public/assets/mobile-banner'].map(d => walk(join(root, d))))).flat().filter(p => /\.(png|jpe?g|webp|avif|gif|svg|tiff?|bmp)$/i.test(p));
  const audit = [];
  for (const path of images) {
    const key = fileKey(join(root, 'public'), path), url = encodePath(key);
    const references = [];
    for (const source of texts) {
      const start = references.length;
      source.text.split('\n').forEach((line, index) => {
        if ([key, url, JSON.stringify(key).slice(1, -1)].some(value => line.includes(value))) references.push({ file: source.file, line: index + 1, text: line.trim(), kind: 'literal' });
      });
      if (references.length === start && source.parsed.has(key)) references.push({ file: source.file, line: 1, text: 'Parsed TS/YAML/JSON image reference (document-level location)', kind: 'parsed' });
    }
    let album = null;
    if (key.startsWith('/images/albums/')) {
      const folder = key.split('/')[3];
      const infoFile = `public/images/albums/${folder}/info.json`;
      try {
        const info = JSON.parse(await readFile(join(root, infoFile), 'utf8'));
        album = { infoFile, mode: info.mode || 'local', hidden: info.hidden === true, cover: info.cover ?? `/images/albums/${folder}/cover.jpg` };
      } catch (error) { album = { infoFile, error: error.message }; }
    }
    const originalBytes = (await stat(path)).size;
    let meta = {}, trial = null, error = null;
    try {
      meta = await sharp(path).metadata();
      if (['png', 'jpeg'].includes(meta.format) && (meta.pages || 1) === 1) {
        const bytes = await sharp(path).rotate().webp({ quality: 85 }).toBuffer();
        trial = { sameSizeQ85Bytes: bytes.length, savedBytes: originalBytes - bytes.length };
      }
    } catch (failure) { error = failure.message; }
    audit.push({ url, originalBytes, format: meta.format, width: meta.width, height: meta.height, cdn: cdn.find(e => e.local === key)?.key || null, dynamicAlbum: album ? 'album-scanner builds paths; metadata is informational, not proof of public use or access control' : null, album, references, trial, error });
  }
  await writeFile(join(output, 'local-reference-audit.json'), JSON.stringify(audit, null, 2) + '\n');
  await writeFile(join(output, 'audit-diagnostics.json'), JSON.stringify(diagnostics, null, 2) + '\n');
  const lines = ['# 图片引用逐项清单', '', '字面/解析引用 + 相册动态扫描标记；不是外部数据库或互联网上所有引用的证明。压缩值为同尺寸 q85 编码试算，尚未替换。不得据此删除原图。解析错误另见 audit-diagnostics.json。', ''];
  for (const entry of audit) {
    lines.push(`## ${entry.url}`, '', `${entry.width ?? '?'}×${entry.height ?? '?'}，${entry.originalBytes} B；WebP试算 ${entry.trial?.sameSizeQ85Bytes ?? '不处理'} B。${entry.cdn ? ' CDN：' + entry.cdn : ''}`, '');
    if (entry.dynamicAlbum) lines.push(`- 动态相册：${JSON.stringify(entry.album)}`);
    if (entry.error) lines.push(`- 解码失败：${entry.error}`);
    for (const ref of entry.references) lines.push(`- ${ref.file}:${ref.line} — ${ref.text.replaceAll('`', '')}`);
    if (!entry.references.length && !entry.dynamicAlbum) lines.push('- 未找到完整 URL 引用；不据此删除。');
    lines.push('');
  }
  await writeFile(join(output, 'local-reference-audit.md'), lines.join('\n'));
  return { output, cdn: manifest, auditedImages: audit.length, diagnostics };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await exportImageAudit({ output: process.argv[2] }), null, 2));
}
