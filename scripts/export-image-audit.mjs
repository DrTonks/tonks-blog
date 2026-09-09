// Reproducible, non-destructive export. Never uploads or changes site URLs.
import { readdir, readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, relative, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || join(root, '../blog-image-webp-upload'));
if (output === root || output.startsWith(root + '/')) throw new Error('Export must be outside project');
// Exclusive creation prevents accidental replacement of an earlier upload package.
await mkdir(output);
async function walk(dir) {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) list.push(...await walk(path));
    else if (entry.isFile()) list.push(path);
  }
  return list.sort();
}
const cdnText = await readFile(join(root, 'src/config/cdn.ts'), 'utf8');
const cdn = [...cdnText.matchAll(/'([^']+)':\s*`\$\{CDN_BASE\}([^`]+)`/g)].map(m => ({ local: m[1], key: 'blog' + m[2] }));
if (cdn.length !== 11) throw new Error('CDN configuration changed; review export mapping before proceeding');
const manifest = [];
for (const entry of cdn) {
  const input = join(root, 'public', entry.local);
  const meta = await sharp(input).metadata();
  if ((meta.pages || 1) > 1) throw new Error(`Animated input requires review: ${entry.local}`);
  const key = entry.key.replace(/\.[^.]+$/, '.webp');
  const target = join(output, 'upload', key);
  await mkdir(dirname(target), { recursive: true });
  // Preserve dimensions, orient before stripping metadata; no client-side conversion.
  await sharp(input).rotate().webp({ quality: 85 }).toFile(target);
  const bytes = await readFile(target);
  manifest.push({ source: entry.local, oldKey: entry.key, key, url: `https://img.tonks.top/${key}`, originalBytes: (await stat(input)).size, webpBytes: bytes.length, width: meta.width, height: meta.height, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(output, 'cdn-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const sourceFiles = (await Promise.all(['src', 'public', 'scripts'].map(d=>walk(join(root,d))))).flat().filter(p=>/\.(astro|svelte|[cm]?[jt]sx?|json|mdx?|css|html|ya?ml)$/i.test(p) && p !== fileURLToPath(import.meta.url));
const texts = await Promise.all(sourceFiles.map(async path=>({file:relative(root,path), text:await readFile(path,'utf8')})));
const images = (await Promise.all(['public/images/albums','public/images/projects','public/images/covers','public/assets/home','public/assets/desktop-banner','public/assets/mobile-banner'].map(d=>walk(join(root,d))))).flat().filter(p=>/\.(png|jpe?g|webp|avif|gif|svg|tiff?|bmp)$/i.test(p));
const audit = [];
for (const path of images) {
  const url = '/' + relative(join(root,'public'),path);
  const references = [];
  for (const source of texts) {
    source.text.split('\n').forEach((line,index)=>{
      if (line.includes(url) || line.includes(encodeURI(url))) references.push({file:source.file,line:index+1,text:line.trim()});
    });
  }
  const meta = await sharp(path).metadata();
  const originalBytes = (await stat(path)).size;
  let trial = null;
  if (['png','jpeg'].includes(meta.format) && (meta.pages || 1) === 1) {
    const bytes = await sharp(path).rotate().webp({quality:85}).toBuffer();
    trial = { sameSizeQ85Bytes: bytes.length, savedBytes: originalBytes-bytes.length };
  }
  audit.push({url, originalBytes, format:meta.format, width:meta.width,height:meta.height, cdn:cdn.find(e=>e.local===url)?.key || null, dynamicAlbum: url.startsWith('/images/albums/') ? 'album-scanner builds paths; cover.jpg special-cased, hidden/external mode must be checked' : null, references, trial});
}
await writeFile(join(output,'local-reference-audit.json'),JSON.stringify(audit,null,2)+'\n');
const lines = ['# 图片引用逐项清单', '', '自动字面引用 + 相册动态扫描标记；不是外部数据库或互联网上所有引用的证明。压缩值为同尺寸 q85 编码试算，尚未替换。', ''];
for (const entry of audit) {
  lines.push(`## ${entry.url}`, '', `${entry.width}×${entry.height}，${entry.originalBytes} B；WebP试算 ${entry.trial?.sameSizeQ85Bytes ?? '不处理'} B。${entry.cdn ? ' CDN：'+entry.cdn : ''}`, '');
  if (entry.dynamicAlbum) lines.push('- 动态引用：album-scanner（需检查 info.json 的 hidden / external 模式）。');
  for (const ref of entry.references) lines.push(`- ${ref.file}:${ref.line} — ${ref.text.replaceAll('`','')}`);
  if (!entry.references.length && !entry.dynamicAlbum) lines.push('- 未找到完整 URL 字面引用；不据此删除。');
  lines.push('');
}
await writeFile(join(output,'local-reference-audit.md'),lines.join('\n'));
console.log(JSON.stringify({output,cdn:manifest, auditedImages:audit.length},null,2));
