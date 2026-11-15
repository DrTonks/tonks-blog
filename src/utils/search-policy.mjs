// Shared by canonical tags, sitemap generation and artifact checks.
export const BLOG_ORIGIN = 'https://blog.tonks.top';
export const excludedPaths = new Set(['/font-test/', '/construction/', '/404/']);
export function canonicalUrl(input) {
  const value = new URL(input, BLOG_ORIGIN);
  const path = value.pathname.replace(/\/index\.html$/, '/');
  return new URL(path, BLOG_ORIGIN).href;
}
export function isIndexable(input) {
  const path = new URL(input, BLOG_ORIGIN).pathname;
  return !excludedPaths.has(path.endsWith('/') ? path : path + '/') && !path.startsWith('/agent/');
}

