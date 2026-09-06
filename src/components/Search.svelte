<script lang="ts">
import Icon from "@iconify/svelte";
import { onMount, tick } from "svelte";
import type { SearchResult } from "@/global";
import { navigateToPage } from "@utils/navigation-utils";

let keyword = "";
let result: SearchResult[] = [];
let open = false;
let busy = false;
let message = "输入关键词搜索文章";
let input: HTMLInputElement;
let button: HTMLButtonElement;
let panel: HTMLDivElement;
let timer: ReturnType<typeof setTimeout>;
let request = 0;

function closePanel(restoreFocus = false) {
 open = false;
 ++request;
 clearTimeout(timer);
 busy = false;
 if (restoreFocus) button?.focus();
}
async function togglePanel() {
 if (open) { closePanel(); return; }
 open = true;
 await tick();
 input?.focus();
 queueSearch();
}
function queueSearch() {
 const id = ++request;
 clearTimeout(timer);
 result = [];
 busy = false;
 const query = keyword.trim();
 if (!query) { message = "输入关键词搜索文章"; return; }
 busy = true;
 timer = setTimeout(() => runSearch(query, id), 180);
}
async function runSearch(query: string, id: number) {
 try {
  if (!window.pagefind?.search) {
   if (id === request) message = import.meta.env.DEV ? "开发模式不提供搜索索引，请构建后预览。" : "搜索索引正在准备，请稍后重试。";
   return;
  }
  const response = await window.pagefind.search(query);
  const items = await Promise.all(response.results.slice(0, 30).map(item => item.data()));
  if (id !== request || !open) return;
  result = items;
  message = items.length ? (response.results.length > 30 ? "显示前 30 条结果，请细化关键词" : `找到 ${items.length} 条结果`) : "没有找到相关内容，试试其他关键词";
 } catch {
  if (id === request) message = "搜索暂时不可用，请稍后重试。";
 } finally {
  if (id === request) busy = false;
 }
}
function followResult(event: MouseEvent, href: string) {
 if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
 event.preventDefault();
 closePanel();
 navigateToPage(href);
}
onMount(() => {
 const outside = (event: PointerEvent) => {
  if (event.target instanceof Node && !panel?.contains(event.target) && !button?.contains(event.target)) closePanel();
 };
 const escape = (event: KeyboardEvent) => {
  if (open && event.key === "Escape") { event.preventDefault(); closePanel(true); }
 };
 const failed = () => { ++request; clearTimeout(timer); busy = false; message = "搜索索引加载失败，请刷新页面重试。"; };
 const ready = () => { if (open && keyword.trim()) queueSearch(); };
 const page = () => closePanel();
 document.addEventListener("pointerdown", outside);
 document.addEventListener("keydown", escape);
 document.addEventListener("pagefindready", ready);
 document.addEventListener("pagefindloaderror", failed);
 document.addEventListener("swup:page:view", page);
 return () => {
  ++request;
  clearTimeout(timer);
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", escape);
  document.removeEventListener("pagefindready", ready);
  document.removeEventListener("pagefindloaderror", failed);
  document.removeEventListener("swup:page:view", page);
 };
});
</script>

<button bind:this={button} type="button" on:click={togglePanel} aria-label="搜索文章" title="搜索文章" aria-expanded={open} aria-controls="search-panel" id="search-switch"
 class="btn-plain scale-animation rounded-lg w-11 h-11 active:scale-90">
 <Icon icon="material-symbols:search" class="text-[1.25rem]" />
</button>
<div bind:this={panel} id="search-panel" class:float-panel-closed={!open} inert={!open} class="float-panel search-panel absolute top-20 left-4 md:left-[unset] right-4 md:w-[30rem] shadow-2xl rounded-2xl p-3" role="search" aria-label="站内文章搜索">
 <div class="search-input-row">
  <Icon icon="material-symbols:search" class="text-xl" />
  <input bind:this={input} bind:value={keyword} on:input={queueSearch} type="text" inputmode="search" placeholder="搜索文章…" aria-label="搜索关键词" autocomplete="off" />
  <button type="button" aria-label="关闭搜索" on:click={() => closePanel(true)}><Icon icon="material-symbols:close-rounded" class="text-xl" /></button>
 </div>
 <p class="search-status" role="status">{busy ? "正在搜索…" : message}</p>
 {#each result as item}
  <a href={item.url} on:click={(event) => followResult(event, item.url)} class="search-result">
   <div class="search-title">{item.meta.title}</div>
   <div class="search-excerpt">{@html item.excerpt}</div>
  </a>
 {/each}
</div>
<style>
 :global(html body #navbar #search-panel#search-panel) {
  background: var(--card-bg) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
 }
 .search-panel { max-height: calc(100dvh - 6.5rem); overflow-y: auto; color: var(--text-secondary); }
 .search-input-row { display: flex; align-items: center; gap: .5rem; padding: .6rem; border-radius: .7rem; background: var(--btn-plain-bg-hover); }
 input { flex: 1; min-width: 0; width: 100%; background: transparent; color: var(--tw-prose-headings, var(--text-secondary)); font: inherit; outline: none; }
 .search-input-row:focus-within { box-shadow: inset 0 0 0 2px var(--primary); }
 .search-input-row button { display: grid; place-items: center; padding: .25rem; }
 .search-status { font-size: .8rem; margin: .75rem .5rem; }
 .search-result { display: block; border-radius: .7rem; padding: .75rem; text-decoration: none; }
 .search-result:hover { background: var(--btn-plain-bg-hover); }
 .search-result:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
 .search-title { color: var(--text-secondary); font-weight: 650; line-height: 1.6; }
 .search-excerpt { font-size: .875rem; line-height: 1.7; margin-top: .3rem; color: var(--text-secondary); }
</style>
