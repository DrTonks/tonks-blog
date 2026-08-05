<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import Icon from '@iconify/svelte';
  import { i18n } from '../i18n/translation';
  import I18nKey from '../i18n/i18nKey';

  type TimelineItem = {
    id: string;
    title: string;
    description: string;
  type: 'education' | 'work' | 'project' | 'achievement' | 'love';
    startDate: string;
    endDate?: string;
    location?: string;
    organization?: string;
    position?: string;
    skills?: string[];
    achievements?: string[];
    links?: { name: string; url: string; type: 'website'|'certificate'|'project'|'other' }[];
    icon?: string;
    color?: string;
    featured?: boolean;
    image?: string | string[];
  };

  let items: TimelineItem[] = [];
  let loading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      const res = await fetch('/data/timeline.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch timeline.json');
      items = await res.json();
      // sanitize links and ensure link URLs are valid to avoid rendering/logging booleans
      const sanitizeUrl = (u: any) => {
        try {
          if (!u) return false;
          const s = typeof u === 'string' ? u : (u.url || '');
          new URL(s);
          return s;
        } catch (e) {
          return false;
        }
      };
        items = items.map((it: any) => {
          if (Array.isArray(it.links)) {
            it.links = it.links
              .map((l: any) => ({ name: l.name || (l.url || ''), url: sanitizeUrl(l.url), type: l.type || 'website' }))
              .filter((l: any) => !!l.url);
          }
          // normalize image field to array when present
          if (it.image) {
            if (Array.isArray(it.image)) {
              it.image = it.image.filter((x: any) => !!x);
            } else if (typeof it.image === 'string') {
              it.image = it.image ? [it.image] : [];
            } else {
              it.image = [];
            }
          }
          return it;
        });
    } catch (e: any) {
      console.error(e);
      error = e?.message || String(e);
    } finally {
      loading = false;
      // after DOM mount, compute padding and start listening
      // use setTimeout to wait for DOM to render
      setTimeout(() => {
        recomputePadding();
        scheduleUpdate();
      }, 0);
      if (isBrowser) {
        window.addEventListener('scroll', onScrollHandler, { passive: true });
        window.addEventListener('resize', onResizeHandler);
      }
    }
  });

  onDestroy(() => {
    if (isBrowser) {
      window.removeEventListener('scroll', onScrollHandler);
      window.removeEventListener('resize', onResizeHandler);
    }
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
  };

  const getDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));

    if (diffMonths < 12) {
      return `${diffMonths} ${i18n(I18nKey.timelineMonths)}`;
    } else {
      const years = Math.floor(diffMonths / 12);
      const months = diffMonths % 12;
      if (months === 0) {
        return `${years} ${i18n(I18nKey.timelineYears)}`;
      } else {
        return `${years} ${i18n(I18nKey.timelineYears)} ${months} ${i18n(I18nKey.timelineMonths)}`;
      }
    }
  };

  // Only compute the timeline items sorted by start date; other statistics removed to keep focus on history
  $: allTimelineItems = items.slice().sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  // center-detection state
  let activeId: string | null = null;
  let containerEl: HTMLElement | null = null;
  let rafPending = false;
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  function updateActive() {
    if (!isBrowser || !containerEl) return;
    const cards = Array.from(containerEl.querySelectorAll<HTMLElement>('.timeline-card'));
    if (cards.length === 0) return;
    const centerY = window.innerHeight / 2;
    let minDist = Infinity;
    let nearestId: string | null = null;
    cards.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const d = Math.abs(cardCenter - centerY);
      if (d < minDist) {
        minDist = d;
        nearestId = el.dataset.id || null;
      }
    });
    activeId = nearestId;
  }

  function scheduleUpdate() {
    if (!isBrowser) return;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      updateActive();
      rafPending = false;
    });
  }

  function recomputePadding() {
    if (!isBrowser || !containerEl) return;
    const firstCard = containerEl.querySelector<HTMLElement>('.timeline-card');
    const vh = window.innerHeight;
    if (firstCard) {
  // Use a slightly higher-than-center anchor so the highlighted card sits a bit above exact center
  const anchorRatio = 0.42; // previously 0.45
      const cardH = firstCard.getBoundingClientRect().height;
      // Try to use symmetric padding based on first and last card heights so either end can center
      const lastCard = containerEl.querySelector<HTMLElement>('.timeline-card:last-child');
      const lastH = lastCard ? lastCard.getBoundingClientRect().height : cardH;
      const desiredTop = (vh * anchorRatio) - (cardH / 2);
      const desiredBottom = (vh * (1 - anchorRatio)) - (lastH / 2);
      // clamp padding to reasonable limits to avoid huge gaps on tall viewports
  const minPad = 8; // px (smaller minimum gap)
  const maxPad = 80; // px (smaller maximum cap)
      const padTop = Math.min(Math.max(desiredTop, minPad), maxPad);
      const padBottom = Math.min(Math.max(desiredBottom, minPad), maxPad);
      containerEl.style.paddingTop = `${padTop}px`;
      containerEl.style.paddingBottom = `${padBottom}px`;
    } else {
      containerEl.style.paddingTop = '';
      containerEl.style.paddingBottom = '';
    }
  }

  function onScrollHandler() {
    scheduleUpdate();
  }

  function onResizeHandler() {
    recomputePadding();
    scheduleUpdate();
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'education': return 'material-symbols:school';
      case 'love': return 'material-symbols:favorite';
      case 'work': return 'material-symbols:work';
      case 'project': return 'material-symbols:code';
      case 'achievement': return 'material-symbols:emoji-events';
      default: return 'material-symbols:event';
    }
  };

  const getBadgeText = (type: string) => {
    if (type === 'education') return i18n(I18nKey.timelineEducation);
    if (type === 'work') return i18n(I18nKey.timelineWork);
    if (type === 'project') return i18n(I18nKey.timelineProject);
    if (type === 'love') return '❤️';
    return i18n(I18nKey.timelineAchievement);
  };

  const getBadgeClass = (type: string) => {
    if (type === 'education') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (type === 'work') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (type === 'project') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    if (type === 'love') return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  };

    function isValidUrl(u: string) {
      try {
        new URL(u);
        return true;
      } catch {
        return false;
      }
    }

    const getLinkEmoji = (type: string) => {
      switch (type) {
        case 'certificate': return '🏆';
        case 'project': return '🔗';
        case 'website': return '🌐';
        default: return '🔗';
      }
    };
</script>

{#if loading}
  <div>Loading timeline…</div>
{:else if error}
  <div class="text-red-600">Error: {error}</div>
{:else}
  <!-- 图标通过 @iconify/svelte 渲染，icons 在客户端动态加载 -->

  <div class="flex w-full rounded-[var(--radius-large)] overflow-hidden relative min-h-32">
    <div class="card-base z-10 px-9 py-6 relative w-full">
      <!-- 保留历史时间线（仅渲染卡片列表） -->

      <!-- 时间线 -->
      <div class="mb-8">
        <div class="relative">
          <div class="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
          <div class="space-y-8" bind:this={containerEl}>
            {#each allTimelineItems as item}
              <div class="relative flex items-start gap-6 timeline-item timeline-card" data-id={item.id} class:active={activeId === item.id}>
                <div class="relative z-10 w-12 h-12 rounded-full flex items-center justify-center" style={`background-color: ${item.color || 'rgb(99 102 241)'}`}>
                  <Icon icon={item.icon || getTypeIcon(item.type)} class="text-xl text-white" color="white" />
                </div>
                <div class="flex-1">
                  <div class="card-content relative bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 p-6 transition-transform duration-300">
                    <div class="overlay absolute inset-0 bg-black/50 dark:bg-black/40 pointer-events-none transition-opacity duration-300"></div>
                    <div class="card-inner relative z-10">
                      <div class="flex items-start justify-between mb-3">
                        <div>
                          <h3 class="text-xl font-semibold text-black/90 dark:text-white/90 mb-1">{item.title}</h3>
                          {#if item.organization}
                            <div class="text-sm text-black/70 dark:text-white/70">{item.organization} {item.position && `• ${item.position}`}</div>
                          {/if}
                        </div>
                        <span class={`px-2 py-1 text-xs rounded-full ${getBadgeClass(item.type)}`}>{getBadgeText(item.type)}</span>
                      </div>
                      <div class="flex items-center gap-4 mb-3 text-sm text-black/60 dark:text-white/60">
                        <div>{formatDate(item.startDate)} - {item.endDate ? formatDate(item.endDate) : i18n(I18nKey.timelinePresent)}</div>
                        <div>•</div>
                        <div>{getDuration(item.startDate, item.endDate)}</div>
                        {#if item.location}
                          <div class="flex items-center gap-1">
                            <div>•</div>
                            <div>📍 {item.location}</div>
                          </div>
                        {/if}
                      </div>
                      <p class="text-black/70 dark:text-white/70 mb-4">{item.description}</p>
                      {#if item.image && item.image.length > 0}
                        <div class="mb-4">
                          <div class="image-gallery flex flex-wrap gap-2" transition:fade|local={{ duration: 220 }}>
                            {#each item.image as imgSrc}
                              <img src={imgSrc} alt={item.title} loading="lazy" class="inline-block max-h-40 object-cover rounded-md" transition:slide|local={{ duration: 240 }} />
                            {/each}
                          </div>
                        </div>
                      {/if}
                      {#if item.achievements && item.achievements.length > 0}
                        <div class="mb-4">
                          <h4 class="text-sm font-semibold text-black/80 dark:text-white/80 mb-2">{i18n(I18nKey.timelineAchievements)}</h4>
                          <ul class="space-y-1">
                            {#each item.achievements as ach}
                              <li class="text-sm text-black/70 dark:text-white/70 flex items-start gap-2"><span class="text-green-500 mt-1">•</span><span>{ach}</span></li>
                            {/each}
                          </ul>
                        </div>
                      {/if}
                      {#if item.skills && item.skills.length > 0}
                        <div class="mb-4">
                          <div class="flex flex-wrap gap-1">
                            {#each item.skills as skill}
                              <span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded">{skill}</span>
                            {/each}
                          </div>
                        </div>
                      {/if}
                      {#if item.links && item.links.length > 0}
                        <div class="flex gap-4">
                          {#each item.links as link}
                            {#if link && link.url && isValidUrl(link.url)}
                              <a href={link.url} target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium flex items-center gap-1">
                                {@html getLinkEmoji(link.type)}
                                <span>{link.name || link.url}</span>
                              </a>
                            {/if}
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- 已移除统计区块，仅保留历史记录 -->
    </div>
  </div>
{/if}

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Timeline card overlay and active styles */
  .timeline-card .card-content {
    position: relative;
    overflow: hidden;
    will-change: transform, box-shadow;
    transition: transform 350ms cubic-bezier(.2,.9,.3,1), box-shadow 350ms cubic-bezier(.2,.9,.3,1);
  }

  .timeline-card .overlay {
    opacity: 0;
    transition: opacity 300ms ease;
  }

  /* Light mode: remove gray overlay and add golden outline/glow on active card */
  :global(html:not(.dark)) .timeline-card.active .card-content {
    transform: scale(1.02);
    box-shadow: 0 10px 30px rgba(250, 215, 100, 0.12), 0 6px 18px rgba(250, 215, 100, 0.08);
    border: 1px solid rgba(250, 215, 100, 0.9);
  }

  /* Dark mode: keep existing overlay behavior (dimmed mask) */
  :global(.dark) .timeline-card .overlay {
    opacity: 1;
    transition: opacity 300ms ease;
  }

  :global(.dark) .timeline-card.active .card-content {
    transform: scale(1.02);
    box-shadow: 0 10px 30px rgba(255,255,255,0.08), 0 6px 18px rgba(0,0,0,0.12);
  }

  :global(.dark) .timeline-card.active .overlay {
    opacity: 0;
  }

  /* ensure first/last cards have visible spacing when centered */
  .space-y-8 { display: block; }

</style>
