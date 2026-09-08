// Astro strips a final /index from directory-homepage slugs. Prefer exact
// public slugs, then the source entry ID, then the legacy /index key.
export function findAuthoredSummary(summaries: Record<string, string>, slug: string, id?: string): string | undefined {
  const source = id?.replace(/\.(md|mdx)$/i, '');
  for (const key of [slug, source, `${slug}/index`]) {
    if (key && Object.prototype.hasOwnProperty.call(summaries, key)) {
      const value = summaries[key]?.trim();
      if (value) return value;
    }
  }
  return undefined;
}
