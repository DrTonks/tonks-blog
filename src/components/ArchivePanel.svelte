<script lang="ts">
import { onMount } from "svelte";
import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";
import { getPostUrlBySlug } from "../utils/url-utils";

export let tags: string[] = [];
export let categories: string[] = [];
export let sortedPosts: Post[] = [];

let uncategorized = false;
let filterRevision = 0;

interface Post {
	slug: string;
	data: {
		title: string;
		tags: string[];
		category?: string;
		published: Date | string;
	};
}

interface Group {
	year: number;
	posts: Post[];
}

onMount(() => {
	const params = new URLSearchParams(window.location.search);
	tags = params.has("tag") ? params.getAll("tag") : [];
	categories = params.has("category") ? params.getAll("category") : [];
	uncategorized = params.has("uncategorized");
});

const asDate = (value: Date | string) =>
	value instanceof Date ? value : new Date(value);

function formatDate(value: Date | string) {
	const date = asDate(value);
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	return `${month}.${day}`;
}

function formatTag(tagList: string[]) {
	return tagList.map((tag) => `#${tag}`).join("  ");
}

$: filteredPosts = sortedPosts.filter((post) => {
	if (
		tags.length > 0 &&
		!(
			Array.isArray(post.data.tags) &&
			post.data.tags.some((tag) => tags.includes(tag))
		)
	)
		return false;
	if (
		categories.length > 0 &&
		!(post.data.category && categories.includes(post.data.category))
	)
		return false;
	if (uncategorized && post.data.category) return false;
	return true;
});

$: categoryOptions = Array.from(
	new Set(
		sortedPosts
			.map((post) => post.data.category)
			.filter((category): category is string => Boolean(category)),
	),
).sort((left, right) => left.localeCompare(right, "zh-CN"));

$: selectedCategory =
	categories.length === 1 && !uncategorized ? categories[0] : null;

function updateArchiveQuery() {
	const params = new URLSearchParams();
	for (const tag of tags) params.append("tag", tag);
	for (const category of categories) params.append("category", category);
	if (uncategorized) params.set("uncategorized", "");
	const query = params.toString();
	window.history.replaceState(
		{},
		"",
		`${window.location.pathname}${query ? `?${query}` : ""}`,
	);
}

function selectCategory(category: string) {
	categories = category ? [category] : [];
	uncategorized = false;
	filterRevision += 1;
	updateArchiveQuery();
}



$: groups = Object.entries(
	filteredPosts.reduce(
		(grouped, post) => {
			const year = asDate(post.data.published).getFullYear();
			grouped[year] ||= [];
			grouped[year].push(post);
			return grouped;
		},
		{} as Record<number, Post[]>,
	),
)
	.map(([year, posts]) => ({ year: Number.parseInt(year, 10), posts }))
	.sort((left, right) => right.year - left.year) as Group[];
</script>

<div class="archive-shell card-base">
  <header class="archive-header">
    <div>
      <span class="archive-kicker">ARCHIVE / CHRONOLOGICAL INDEX</span>
      <h1>{i18n(I18nKey.archive)}</h1>
      <p>拾光落墨，旧事归藏。</p>
    </div>
    <div class="archive-summary" aria-label="归档统计">
      <span><strong>{String(filteredPosts.length).padStart(2, "0")}</strong><small>ENTRIES</small></span>
      <span><strong>{String(groups.length).padStart(2, "0")}</strong><small>YEARS</small></span>
    </div>
  </header>

  <nav class="archive-category-bar" aria-label="按分类浏览归档">
    <span class="archive-category-bar__label">CATEGORIES</span>
    <div class="archive-category-bar__scroll">
      <button type="button" class:active={categories.length === 0 && !uncategorized} on:click={() => selectCategory("")}>全部 <small>{sortedPosts.length}</small></button>
      {#each categoryOptions as category}
        <button type="button" class:active={selectedCategory === category} on:click={() => selectCategory(category)}>{category} <small>{sortedPosts.filter((post) => post.data.category === category).length}</small></button>
      {/each}
    </div>
  </nav>

  {#key filterRevision}
    <div class="archive-results-view" aria-live="polite">
      {#if groups.length > 0}
        <div class="archive-index">
          {#each groups as group, groupIndex}
            <section class="archive-year" aria-labelledby={`archive-year-${group.year}`}>
              <header class="year-heading">
                <div class="year-code">YR-{String(groupIndex + 1).padStart(2, "0")}</div>
                <h2 id={`archive-year-${group.year}`}>{group.year}</h2>
                <span>{String(group.posts.length).padStart(2, "0")} {i18n(group.posts.length === 1 ? I18nKey.postCount : I18nKey.postsCount)}</span>
              </header>

              <div class="year-entries">
                {#each group.posts as post, postIndex}
                  <a href={getPostUrlBySlug(post.slug)} aria-label={post.data.title} class="archive-entry">
                    <span class="entry-sequence">{String(postIndex + 1).padStart(2, "0")}</span>
                    <time datetime={asDate(post.data.published).toISOString()}>{formatDate(post.data.published)}</time>
                    <span class="entry-node" aria-hidden="true"><i></i></span>
                    <span class="entry-title">{post.data.title}</span>
                    <span class="entry-tags">{formatTag(post.data.tags)}</span>
                    <span class="entry-arrow" aria-hidden="true">→</span>
                  </a>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {:else}
        <div class="archive-empty">NO MATCHING ENTRIES</div>
      {/if}
    </div>
  {/key}
</div>
