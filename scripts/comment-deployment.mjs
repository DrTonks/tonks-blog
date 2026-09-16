import fs from 'node:fs';
import path from 'node:path';

export function readCommentManifest(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'community/comment-manifest.json'), 'utf8'));
  if (manifest.schema !== 1 || !Array.isArray(manifest.articles)) throw new Error('Invalid article comment manifest');
  const ids = new Set();
  for (const article of manifest.articles) {
    if (!/^a_[a-zA-Z0-9_-]+$/.test(article.id) || !article.slug || !article.version || !Array.isArray(article.blocks) || article.draft || article.encrypted || ids.has(article.id)) {
      throw new Error(`Invalid or duplicate comment article: ${article.id}`);
    }
    ids.add(article.id);
  }
  return manifest;
}

export async function verifyCommentBackend(manifest, baseUrl, request = fetch) {
  for (const article of manifest.articles) {
    try {
    const response = await request(new URL(`api/blog/community/articles/${encodeURIComponent(article.id)}/comments`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`), { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.success !== true) throw new Error(`Blog published, but comment verification failed: ${article.slug}. Check SLEEPY_ARTICLE_MANIFEST; the release has NOT been rolled back.`);
    } catch (cause) {
      throw new Error(`Blog published, but comment verification failed: ${article.slug}. Check SLEEPY_ARTICLE_MANIFEST and backend health; the release has NOT been rolled back.`, { cause });
    }
  }
}
