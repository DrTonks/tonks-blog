import manifest from 'virtual:optimized-images';

/** Source URLs remain stable IDs. Unknown/new/remote images retain their original URL. */
export function optimizedImage(src: string, kind: 'thumbnail' | 'display' = 'thumbnail'): string {
  if (!src.startsWith('/images/')) return src;
  let entry = manifest[src];
  if (!entry) {
    try {
      const key = src.split(/[?#]/)[0].split('/').map(part => {
        const decoded = decodeURIComponent(part);
        if (/[\\/\u0000-\u001f:]/.test(decoded) || decoded === '.' || decoded === '..') throw new Error('Invalid image URL');
        return decoded;
      }).join('/');
      entry = manifest[key];
    } catch { return src; }
  }
  const optimized = entry?.[kind];
  // Preserve the caller's original query/fragment when no derivative is chosen.
  return optimized?.startsWith('/_images/') ? optimized + (src.match(/[?#].*$/)?.[0] ?? '') : src;
}
