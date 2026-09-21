// Astro strips a final /index from directory-homepage slugs. Prefer exact
// public slugs, then the source entry ID, then the legacy /index key.
export interface AuthoredSummary {
  summary: string;
  model?: string;
  generatedAt?: string;
}

export interface ArticleSummary {
  slug: string;
  summary: string;
  model?: string;
}

export function findAuthoredSummary(summaries: Record<string, string | AuthoredSummary>, slug: string, id?: string): AuthoredSummary | undefined {
  const source = id?.replace(/\.(md|mdx)$/i, '');
  for (const key of [slug, source, `${slug}/index`]) {
    if (key && Object.prototype.hasOwnProperty.call(summaries, key)) {
      const value = summaries[key];
      const summary = (typeof value === 'string' ? value : value?.summary)?.trim();
      if (summary) return typeof value === 'string'
        ? { summary }
        : { ...value, summary, model: value.model?.trim() || undefined };
    }
  }
  return undefined;
}
