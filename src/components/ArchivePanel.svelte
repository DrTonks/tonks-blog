<script lang="ts">
  import { onMount } from "svelte";
  import I18nKey from "../i18n/i18nKey";
  import { i18n } from "../i18n/translation";
  import { getPostUrlBySlug } from "../utils/url-utils";

  export let tags: string[] = [];
  export let categories: string[] = [];
  export let sortedPosts: Post[] = [];

  let uncategorized = false;

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

  const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

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
    if (tags.length > 0 && !(Array.isArray(post.data.tags) && post.data.tags.some((tag) => tags.includes(tag)))) return false;
    if (categories.length > 0 && !(post.data.category && categories.includes(post.data.category))) return false;
    if (uncategorized && post.data.category) return false;
    return true;
  });

  $: groups = Object.entries(
    filteredPosts.reduce((grouped, post) => {
      const year = asDate(post.data.published).getFullYear();
      grouped[year] ||= [];
      grouped[year].push(post);
      return grouped;
    }, {} as Record<number, Post[]>),
  )
    .map(([year, posts]) => ({ year: Number.parseInt(year, 10), posts }))
    .sort((left, right) => right.year - left.year) as Group[];
</script>

<div class="archive-shell card-base">
  <header class="archive-header">
    <div>
      <span class="archive-kicker">ARCHIVE / CHRONOLOGICAL INDEX</span>
      <h1>{i18n(I18nKey.archive)}</h1>
      <p>按时间索引所有公开文章，选择任意记录进入正文。</p>
    </div>
    <div class="archive-summary" aria-label="归档统计">
      <span><strong>{String(filteredPosts.length).padStart(2, "0")}</strong><small>ENTRIES</small></span>
      <span><strong>{String(groups.length).padStart(2, "0")}</strong><small>YEARS</small></span>
    </div>
  </header>

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
