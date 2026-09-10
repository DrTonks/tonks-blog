<script lang="ts">
import { getCategoryIcon } from "../utils/category-icons";
import { onMount, tick } from "svelte";
import { fly } from "svelte/transition";
import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";
import { getPostUrlBySlug, pathsEqual, url } from "../utils/url-utils";

export let tags: string[] = [];
export let categories: string[] = [];
export let sortedPosts: Post[] = [];

let uncategorized = false;
let filterRevision = 0;
let searchText = "";
let appliedSearch = "";
let editorOpen = false;
let mounted = false;
let searchControl: HTMLDivElement;
let searchToggle: HTMLButtonElement;
let searchTimer: ReturnType<typeof setTimeout>;
let searchInput: HTMLInputElement;
let floatingPanel: HTMLElement | undefined;
let reducedMotion = false;
let resetting = false;
let resetTimer: ReturnType<typeof setTimeout>;
let widthAnimation: Animation | undefined;
let widthRevision = 0;

async function changeEditor(open: boolean) {
	if (!mounted) return;
	const revision = ++widthRevision;
	// Use layout pixels, not viewport pixels (which can include ancestor transforms).
	const from = searchControl ? Number.parseFloat(getComputedStyle(searchControl).width) : undefined;
	widthAnimation?.cancel();
	editorOpen = open;
	await tick();
	if (!mounted || revision !== widthRevision || !searchControl || from === undefined || reducedMotion) return;
	const to = Number.parseFloat(getComputedStyle(searchControl).width);
	if (Math.abs(to - from) < 1) return;
	const animation = searchControl.animate(
		[{ width: `${from}px` }, { width: `${to}px` }],
		{ duration: 200, easing: "ease" },
	);
	widthAnimation = animation;
	await animation.finished.catch(() => {});
}

async function openEditor() {
	if (!mounted || resetting) return;
	if (!editorOpen) await changeEditor(true);
	else await tick();
	if (!mounted || !editorOpen) return;
	searchInput?.focus({ preventScroll: true });
	searchInput?.setSelectionRange(searchText.length, searchText.length);
	// Only scroll the chip strip once its final width is settled; never scroll the page.
	const strip = searchInput?.parentElement;
	if (strip) strip.scrollLeft = strip.scrollWidth;
}

function resetFilters(event: MouseEvent) {
	if (resetting) return;
	clearTimeout(searchTimer);
	resetting = true;
	const keyboard = event.detail === 0;
	if (!keyboard && document.activeElement instanceof HTMLElement) document.activeElement.blur();
	const finish = () => {
		tags = [];
		categories = [];
		uncategorized = false;
		searchText = "";
		commitFilters();
		resetting = false;
		closeEditor();
		if (keyboard) searchToggle?.focus({ preventScroll: true });
	};
	if (reducedMotion) finish();
	else resetTimer = setTimeout(finish, 120);
}

// Move the panel outside clipped/transformed page containers; position against the viewport.
function floatPanel(node: HTMLElement) {
	floatingPanel = node;
	document.body.appendChild(node);
	let frame = 0;
	const position = () => {
		frame = 0;
		const rect = searchControl.getBoundingClientRect();
		const viewport = window.visualViewport;
		const top = viewport?.offsetTop || 0;
		const height = viewport?.height || innerHeight;
		const below = top + height - rect.bottom - 16;
		const above = rect.top - top - 16;
		const upwards = below < Math.min(node.scrollHeight, 240) && above > below;
		node.style.maxHeight = `${Math.max(80, upwards ? above : below)}px`;
		node.style.left = `${Math.max(12, Math.min(rect.right - node.offsetWidth, innerWidth - node.offsetWidth - 12))}px`;
		node.style.top = `${upwards ? Math.max(top + 8, rect.top - node.offsetHeight - 8) : Math.max(top + 8, rect.bottom + 8)}px`;
	};
	const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
	const observer = new ResizeObserver(schedule);
	observer.observe(searchControl);
	observer.observe(node);
	window.addEventListener("scroll", schedule, true);
	window.addEventListener("resize", schedule);
	window.visualViewport?.addEventListener("resize", schedule);
	position();
	return { destroy() {
		cancelAnimationFrame(frame);
		observer.disconnect();
		window.removeEventListener("scroll", schedule, true);
		window.removeEventListener("resize", schedule);
		window.visualViewport?.removeEventListener("resize", schedule);
		if (floatingPanel === node) floatingPanel = undefined;
		node.remove();
	} };
}

$: tagOptions = Array.from(new Set([...sortedPosts.flatMap((post) => post.data.tags || []), ...tags]))
	.sort((left, right) => left.localeCompare(right, "zh-CN"));
$: searchExpanded = editorOpen || tags.length > 0 || searchText.length > 0;
$: if (mounted) syncSidebarTags(tags);

function syncSidebarTags(selected: string[]) {
	for (const link of document.querySelectorAll<HTMLAnchorElement>("#index-tags a[href]")) {
		const tag = new URL(link.href).searchParams.get("tag");
		link.classList.toggle("archive-tag-selected", Boolean(tag && selected.includes(tag)));
		link.setAttribute("aria-label", `${tag}，${tag && selected.includes(tag) ? "已选择，点击取消" : "点击添加筛选"}`);
	}
}

function toggleTag(tag: string) {
	const keepPanelFocus = floatingPanel?.contains(document.activeElement);
	tags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
	commitFilters();
	if (editorOpen && !keepPanelFocus) void openEditor();
}

function enterTagOptions(event: KeyboardEvent) {
	if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
		const first = floatingPanel?.querySelector<HTMLInputElement>('input[type="checkbox"]');
		if (first) {
			event.preventDefault();
			first.focus({ preventScroll: true });
		}
	}
}

function commitFilters() {
	clearTimeout(searchTimer);
	appliedSearch = searchText.trim();
	filterRevision += 1;
	updateArchiveQuery();
}

function scheduleSearch(event: Event) {
	clearTimeout(searchTimer);
	if ((event as InputEvent).isComposing) return;
	searchTimer = setTimeout(commitFilters, 180);
}

function closeEditor() { if (!resetting) void changeEditor(false); }

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
	searchText = params.get("q") || "";
	appliedSearch = searchText.trim();
	mounted = true;
	const motion = matchMedia("(prefers-reduced-motion: reduce)");
	const syncMotion = () => { reducedMotion = motion.matches; };
	syncMotion();
	motion.addEventListener("change", syncMotion);
	// Handle index links before Swup: keep this island and its filter transition.
	const handleIndexClick = (event: MouseEvent) => {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("#sidebar a[href]") : null;
		if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
		const destination = new URL(link.href, location.href);
		if (destination.origin !== location.origin || !pathsEqual(destination.pathname, url("/archive/")) || destination.hash) return;
		event.preventDefault();
		event.stopPropagation();
		const query = destination.searchParams;
		if (query.has("category") || query.has("uncategorized")) {
			categories = query.getAll("category");
			uncategorized = query.has("uncategorized");
		} else if (query.has("tag")) {
			for (const tag of query.getAll("tag")) {
				tags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
			}
		} else {
			tags = [];
			categories = [];
			uncategorized = false;
		}
		commitFilters();
	};
	const outsideClick = (event: PointerEvent) => {
		if (event.target instanceof Node && !searchControl?.contains(event.target) && !floatingPanel?.contains(event.target)) closeEditor();
	};
	const escape = (event: KeyboardEvent) => {
		if (event.key === "Escape" && editorOpen) {
			event.preventDefault();
			closeEditor();
			searchToggle?.focus({ preventScroll: true });
		}
	};
	document.addEventListener("click", handleIndexClick, true);
	document.addEventListener("pointerdown", outsideClick);
	document.addEventListener("keydown", escape);
	return () => {
		mounted = false;
		widthRevision += 1;
		clearTimeout(searchTimer);
		clearTimeout(resetTimer);
		widthAnimation?.cancel();
		motion.removeEventListener("change", syncMotion);
		document.removeEventListener("click", handleIndexClick, true);
		document.removeEventListener("pointerdown", outsideClick);
		document.removeEventListener("keydown", escape);
		for (const link of document.querySelectorAll("#index-tags a")) {
			link.classList.remove("archive-tag-selected");
			link.removeAttribute("aria-label");
		}
	};
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

$: searchTerms = appliedSearch.toLocaleLowerCase().split(/\s+/).filter(Boolean);
$: taggedPosts = sortedPosts.filter((post) => {
	const searchable = `${post.data.title} ${post.data.category || ""} ${(post.data.tags || []).join(" ")}`.toLocaleLowerCase();
	if (!searchTerms.every((term) => searchable.includes(term))) return false;
	if (
		tags.length > 0 &&
		!(
			Array.isArray(post.data.tags) &&
			post.data.tags.some((tag) => tags.includes(tag))
		)
	)
		return false;
	return true;
});

$: filteredPosts = taggedPosts.filter((post) => {
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
	if (appliedSearch) params.set("q", appliedSearch);
	const query = params.toString();
	const destination = `${window.location.pathname}${query ? `?${query}` : ""}`;
	const state = window.history.state;
	window.history.replaceState(
		state?.source === "swup" ? { ...state, url: destination } : state,
		"",
		destination,
	);
}

function selectCategory(category: string) {
	categories = category ? [category] : [];
	uncategorized = false;
	commitFilters();
}

function clearTags() {
	tags = [];
	commitFilters();
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
    <div class="archive-heading">
      <span class="archive-kicker">ARCHIVE / CHRONOLOGICAL INDEX</span>
      <h1>{i18n(I18nKey.archive)}</h1>
      <p>拾光落墨，旧事归藏。</p>
    </div>
    <div class="archive-search" class:expanded={editorOpen} class:has-filters={searchExpanded} class:resetting bind:this={searchControl}
      on:focusout={(event) => { if (event.relatedTarget instanceof Node && !searchControl.contains(event.relatedTarget) && !floatingPanel?.contains(event.relatedTarget)) closeEditor(); }}>
      <button type="button" class="archive-search-reset" class:is-visible={(tags.length > 0 || searchText.length > 0) && !resetting} inert={!(tags.length > 0 || searchText.length > 0) || resetting} aria-label="全部重置" title="全部重置" on:click={resetFilters}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg>
      </button>
      <div class="archive-search-bar">
        <button type="button" class="archive-search-toggle" bind:this={searchToggle} aria-label="标签与文字筛选" aria-expanded={editorOpen} aria-controls="archive-filter-editor" on:click={() => editorOpen ? closeEditor() : openEditor()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
        </button>
        {#if editorOpen}
          <div class="archive-search-content">
            {#each tags as tag}
              <span class="archive-search-chip"><span class="archive-chip-label" title={tag}>#{tag}</span><button type="button" aria-label={`移除标签 ${tag}`} on:click={() => toggleTag(tag)}>×</button></span>
            {/each}
            <input bind:this={searchInput} class="archive-search-input" type="text" role="searchbox" aria-label="搜索归档" placeholder={tags.length ? "搜索…" : "搜索标题、标签…"} bind:value={searchText} on:input={scheduleSearch} on:compositionend={scheduleSearch} on:keydown={enterTagOptions} />
          </div>
        {:else if tags.length || searchText}
          <button class="archive-search-preview" type="button" aria-label="编辑筛选条件" title={[...tags.map(tag => `#${tag}`), searchText].filter(Boolean).join(" · ")} on:click={openEditor}>
            {#if tags.length}<span class="archive-preview-tag">#{tags[0]}</span>{#if tags.length > 1}<span>+{tags.length - 1}</span>{/if}{/if}
            {#if searchText}<span class="archive-preview-text">{searchText}</span>{/if}
          </button>
        {/if}
      </div>
      {#if editorOpen}
        <section id="archive-filter-editor" class="archive-filter-editor" aria-label="归档标签选项" use:floatPanel transition:fly={{ y: 6, duration: reducedMotion ? 0 : 160 }} inert={!editorOpen || resetting}
          on:focusout={(event) => { if (event.relatedTarget instanceof Node && !searchControl.contains(event.relatedTarget) && !floatingPanel?.contains(event.relatedTarget)) closeEditor(); }}>
          <div class="archive-editor-heading"><strong>可筛选标签</strong>{#if tags.length}<button type="button" on:click={clearTags}>清除标签</button>{/if}</div>
          <div class="archive-tag-options">
            {#each tagOptions as tag}<label class:selected={tags.includes(tag)} on:pointerdown={(event) => { if (event.button === 0) event.preventDefault(); }}><input type="checkbox" checked={tags.includes(tag)} on:change={() => toggleTag(tag)} /><span>{tag}</span></label>{/each}
          </div>
        </section>
      {/if}
    </div>
    <div class="archive-summary" aria-label="归档统计">
      <span><strong>{String(filteredPosts.length).padStart(2, "0")}</strong><small>ENTRIES</small></span>
      <span><strong>{String(groups.length).padStart(2, "0")}</strong><small>YEARS</small></span>
    </div>
  </header>

  <nav class="archive-category-bar" aria-label="按分类浏览归档">
    <span class="archive-category-bar__label">CATEGORIES</span>
    <div class="archive-category-bar__scroll">
      <button type="button" aria-pressed={categories.length === 0 && !uncategorized} class:active={categories.length === 0 && !uncategorized} on:click={() => selectCategory("")}>全部 <small>{taggedPosts.length}</small></button>
      {#each categoryOptions as category}
        <button type="button" aria-pressed={selectedCategory === category} class:active={selectedCategory === category} on:click={() => selectCategory(category)}>{category} <small>{taggedPosts.filter((post) => post.data.category === category).length}</small></button>
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
                    <span class="entry-title"><svg class="entry-category-icon" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={post.data.category || "文章"}><title>{post.data.category || "文章"}</title>{@html getCategoryIcon(post.data.category)}</svg>{post.data.title}</span>
                    <span class="entry-tags">{formatTag(post.data.tags)}</span>
                    <span class="entry-arrow" aria-hidden="true">→</span>
                  </a>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {:else}
        <div class="archive-empty">{tags.length || appliedSearch ? "没有符合筛选条件的文章，试试调整文字、标签或分类。" : "NO MATCHING ENTRIES"}</div>
      {/if}
    </div>
  {/key}
</div>
