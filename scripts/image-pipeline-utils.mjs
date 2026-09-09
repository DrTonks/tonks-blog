import { readdir } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';

// Resolve the declared js-yaml dependency of our existing YAML plugin. This also
// works with pnpm's strict layout, without depending on a hoisted transitive pkg.
const require = createRequire(import.meta.url);
const { load } = createRequire(require.resolve('@rollup/plugin-yaml'))('js-yaml');

export const slash = value => value.replaceAll('\\', '/');
export const fileKey = (root, path) => '/' + slash(relative(root, path));
export const encodePath = value => value.split('/').map(encodeURIComponent).join('/');
export function isWithin(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'));
}

export function localImagePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/images/')) return null;
  let decoded;
  try {
    decoded = value.split(/[?#]/)[0].split('/').map(part => {
      const decodedPart = decodeURIComponent(part);
      if (/[\\/\u0000-\u001f:]/.test(decodedPart) || decodedPart === '.' || decodedPart === '..') throw new Error();
      return decodedPart;
    }).join('/');
  } catch { throw new Error(`Invalid image reference: ${value}`); }
  return decoded;
}

export function frontmatter(text, filename) {
  const match = text.match(/^\uFEFF?---[^\S\r\n]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/m);
  // The opening delimiter must be at the beginning, not a body horizontal rule.
  return match?.index === 0 ? load(match[1], { filename }) ?? {} : {};
}

export async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}
