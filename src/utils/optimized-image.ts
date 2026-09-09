import manifest from 'virtual:optimized-images';

/** Source URLs remain stable IDs. Unknown/new/remote images retain their original URL. */
export function optimizedImage(src: string, kind: 'thumbnail' | 'display' = 'thumbnail'): string {
  return manifest[src]?.[kind] ?? src;
}
