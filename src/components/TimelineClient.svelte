<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Icon from '@iconify/svelte';
  import { i18n } from '../i18n/translation';
  import I18nKey from '../i18n/i18nKey';

  type TimelineLink = {
    name: string;
    url: string;
    type: 'website' | 'certificate' | 'project' | 'other';
  };

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
    links?: TimelineLink[];
    icon?: string;
    color?: string;
    featured?: boolean;
    image?: string[];
  };

  type TimelineYearGroup = {
    year: string;
    items: TimelineItem[];
  };

  export let initialItems: unknown[] = [];

  let items: TimelineItem[] = initialItems.map(normalizeItem);
  let loading = items.length === 0;
  let error: string | null = null;
  let activeId: string | null = null;
  let activeYear = '';
  let scrollProgress = 0;
  let containerEl: HTMLElement | null = null;
  let rafId = 0;

  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  $: allTimelineItems = items
    .slice()
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  $: yearGroups = allTimelineItems.reduce<TimelineYearGroup[]>((groups, item) => {
    const year = getYear(item.startDate);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.year === year) {
      lastGroup.items.push(item);
    } else {
      groups.push({ year, items: [item] });
    }
    return groups;
  }, []);

  $: yearRange = yearGroups.length > 0
    ? `${yearGroups[yearGroups.length - 1].year}—${yearGroups[0].year}`
    : '—';

  onMount(async () => {
    try {
      if (items.length === 0) {
        const response = await fetch('/data/timeline.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch timeline.json');
        const rawItems = await response.json();
        items = rawItems.map(normalizeItem);
      }
    } catch (caught: any) {
      console.error(caught);
      error = caught?.message || String(caught);
    } finally {
      loading = false;
      await tick();
      activeYear = yearGroups[0]?.year || '';
      scheduleUpdate();

      if (isBrowser) {
        window.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);
      }
    }
  });

  onDestroy(() => {
    if (!isBrowser) return;
    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    if (rafId) cancelAnimationFrame(rafId);
  });

  function normalizeItem(item: any): TimelineItem {
    const images = Array.isArray(item.image)
      ? item.image.filter(Boolean)
      : typeof item.image === 'string' && item.image
        ? [item.image]
        : [];

    const links = Array.isArray(item.links)
      ? item.links
          .map((link: any) => ({
            name: link?.name || link?.url || '',
            url: sanitizeUrl(link?.url),
            type: link?.type || 'website'
          }))
          .filter((link: TimelineLink) => Boolean(link.url))
      : [];

    return { ...item, image: images, links };
  }

  function sanitizeUrl(value: unknown) {
    try {
      if (typeof value !== 'string' || !value) return '';
      new URL(value);
      return value;
    } catch {
      return '';
    }
  }

  function getYear(dateString: string) {
    const year = new Date(dateString).getFullYear();
    return Number.isFinite(year) ? String(year) : dateString.slice(0, 4);
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
  }

  function getDuration(startDate: string, endDate?: string) {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));

    if (diffMonths < 12) return `${diffMonths} ${i18n(I18nKey.timelineMonths)}`;

    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;
    return months === 0
      ? `${years} ${i18n(I18nKey.timelineYears)}`
      : `${years} ${i18n(I18nKey.timelineYears)} ${months} ${i18n(I18nKey.timelineMonths)}`;
  }

  function scheduleUpdate() {
    if (!isBrowser || rafId) return;
    rafId = requestAnimationFrame(() => {
      updateTimelineState();
      rafId = 0;
    });
  }

  function updateTimelineState() {
    if (!isBrowser || !containerEl) return;
    const cards = Array.from(containerEl.querySelectorAll<HTMLElement>('.timeline-card'));
    if (cards.length === 0) return;

    const anchorY = window.innerHeight * 0.42;
    const reachedDocumentEnd = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
    let nearestCard = cards[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    if (reachedDocumentEnd) {
      nearestCard = cards[cards.length - 1];
    } else {
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - anchorY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestCard = card;
        }
      }
    }

    activeId = nearestCard.dataset.id || null;
    activeYear = nearestCard.dataset.year || activeYear;

    const firstNode = cards[0].querySelector<HTMLElement>('.timeline-node');
    const lastNode = cards[cards.length - 1].querySelector<HTMLElement>('.timeline-node');
    if (firstNode && lastNode) {
      const firstRect = firstNode.getBoundingClientRect();
      const lastRect = lastNode.getBoundingClientRect();
      const start = firstRect.top + firstRect.height / 2;
      const end = lastRect.top + lastRect.height / 2;
      scrollProgress = reachedDocumentEnd
        ? 100
        : Math.max(0, Math.min(100, ((anchorY - start) / Math.max(end - start, 1)) * 100));
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'education': return 'material-symbols:school';
      case 'love': return 'material-symbols:favorite';
      case 'work': return 'material-symbols:work';
      case 'project': return 'material-symbols:code';
      case 'achievement': return 'material-symbols:emoji-events';
      default: return 'material-symbols:event';
    }
  }

  function getBadgeText(type: string) {
    if (type === 'education') return i18n(I18nKey.timelineEducation);
    if (type === 'work') return i18n(I18nKey.timelineWork);
    if (type === 'project') return i18n(I18nKey.timelineProject);
    if (type === 'love') return '❤️';
    return i18n(I18nKey.timelineAchievement);
  }

  function getBadgeClass(type: string) {
    if (type === 'education') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (type === 'work') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (type === 'project') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    if (type === 'love') return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400';
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  }

  function getLinkEmoji(type: string) {
    switch (type) {
      case 'certificate': return '🏆';
      case 'website': return '🌐';
      default: return '🔗';
    }
  }
</script>

{#if loading}
  <div class="timeline-state card-base">Loading timeline…</div>
{:else if error}
  <div class="timeline-state timeline-state--error card-base">Error: {error}</div>
{:else}
  <div class="timeline-shell card-base">
    <header class="timeline-register">
      <div>
        <span class="timeline-register__eyebrow">CHRONOLOGICAL INDEX</span>
        <strong>{activeYear || yearGroups[0]?.year}</strong>
      </div>
      <div class="timeline-register__meta">
        <span>{yearRange}</span>
        <span>{String(allTimelineItems.length).padStart(2, '0')} ENTRIES</span>
      </div>
    </header>

    <div class="timeline-sequence" bind:this={containerEl} style={`--timeline-progress: ${scrollProgress}%`}>
      <div class="timeline-rail" aria-hidden="true"><span></span></div>

      {#each yearGroups as group (group.year)}
        <section class="timeline-year" data-year={group.year} class:is-current={activeYear === group.year}>
          <div class="timeline-year__ghost" aria-hidden="true">{group.year}</div>

          <header class="timeline-year__header">
            <span class="timeline-year__code">YR / {group.year}</span>
            <span class="timeline-year__rule"></span>
            <span class="timeline-year__count">{String(group.items.length).padStart(2, '0')} EVENTS</span>
          </header>

          <div class="timeline-year__events">
            {#each group.items as item (item.id)}
              <article
                class="timeline-item timeline-card"
                class:active={activeId === item.id}
                data-id={item.id}
                data-year={group.year}
                aria-current={activeId === item.id ? 'step' : undefined}
              >
                <div class="timeline-node" style={`--node-color: ${item.color || 'rgb(99 102 241)'}`} aria-hidden="true">
                  <Icon icon={item.icon || getTypeIcon(item.type)} class="timeline-node__icon" color="currentColor" />
                </div>

                <div class="timeline-card__body">
                  <div class="timeline-card__marker" aria-hidden="true"></div>
                  <div class="timeline-card__head">
                    <div>
                      <h3>{item.title}</h3>
                      {#if item.organization}
                        <div class="timeline-card__organization">
                          {item.organization}{item.position ? ` • ${item.position}` : ''}
                        </div>
                      {/if}
                    </div>
                    <span class={`timeline-badge ${getBadgeClass(item.type)}`}>{getBadgeText(item.type)}</span>
                  </div>

                  <div class="timeline-card__date">
                    <span>{formatDate(item.startDate)} — {item.endDate ? formatDate(item.endDate) : i18n(I18nKey.timelinePresent)}</span>
                    <span class="timeline-card__dot">•</span>
                    <span>{getDuration(item.startDate, item.endDate)}</span>
                    {#if item.location}
                      <span class="timeline-card__dot">•</span>
                      <span>📍 {item.location}</span>
                    {/if}
                  </div>

                  <p class="timeline-card__description">{item.description}</p>

                  {#if item.image && item.image.length > 0}
                    <div class="timeline-gallery">
                      {#each item.image as imageSource}
                        <div class="timeline-gallery__frame">
                          <img src={imageSource} alt={item.title} loading="lazy" decoding="async" />
                        </div>
                      {/each}
                    </div>
                  {/if}

                  {#if item.achievements && item.achievements.length > 0}
                    <div class="timeline-details">
                      <h4>{i18n(I18nKey.timelineAchievements)}</h4>
                      <ul>
                        {#each item.achievements as achievement}
                          <li><span aria-hidden="true">•</span><span>{achievement}</span></li>
                        {/each}
                      </ul>
                    </div>
                  {/if}

                  {#if item.skills && item.skills.length > 0}
                    <div class="timeline-skills">
                      {#each item.skills as skill}<span>{skill}</span>{/each}
                    </div>
                  {/if}

                  {#if item.links && item.links.length > 0}
                    <div class="timeline-links">
                      {#each item.links as link}
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          <span aria-hidden="true">{getLinkEmoji(link.type)}</span>
                          <span>{link.name || link.url}</span>
                        </a>
                      {/each}
                    </div>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </div>
{/if}

<style>
  .timeline-state { padding: 2rem; color: var(--tw-prose-body, currentColor); }
  .timeline-state--error { color: rgb(220 38 38); }

  .timeline-shell {
    position: relative;
    width: 100%;
    overflow: visible;
    clip-path: inset(-100vh 0 -100vh 0);
    isolation: isolate;
    color: rgba(20, 31, 45, 0.92);
  }

  :global(.dark) .timeline-shell { color: rgba(244, 248, 255, 0.9); }

  .timeline-register {
    position: relative;
    z-index: 8;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 2.25rem 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--signal-line) 28%, transparent);
    background: color-mix(in srgb, var(--card-bg) 94%, transparent);
  }

  .timeline-register > div:first-child { display: flex; align-items: baseline; gap: 0.8rem; }

  .timeline-register__eyebrow,
  .timeline-register__meta,
  .timeline-year__code,
  .timeline-year__count {
    font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
    letter-spacing: 0.12em;
  }

  .timeline-register__eyebrow { color: var(--meta-divider); font-size: 0.7rem; font-weight: 800; }

  .timeline-register strong {
    color: var(--primary);
    font: 800 1.35rem/1 "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
    transition: color 180ms ease;
  }

  .timeline-register__meta {
    display: flex;
    gap: 1rem;
    color: var(--meta-divider);
    font-size: 0.66rem;
    font-weight: 700;
  }

  .timeline-sequence {
    --rail-left: 3.75rem;
    position: relative;
    padding-inline: 2.25rem;
    padding-bottom: 6rem;
  }

  .timeline-rail {
    position: absolute;
    z-index: 1;
    top: 7.8rem;
    bottom: 7rem;
    left: var(--rail-left);
    width: 1px;
    background: color-mix(in srgb, var(--meta-divider) 24%, transparent);
  }

  .timeline-rail span {
    display: block;
    width: 3px;
    height: var(--timeline-progress);
    margin-left: -1px;
    border-radius: 999px;
    background: linear-gradient(to bottom, var(--primary), var(--signal-line));
    box-shadow: 0 0 1rem color-mix(in srgb, var(--signal-line) 32%, transparent);
    transition: height 140ms linear;
  }

  .timeline-year { position: relative; z-index: 2; min-height: 20rem; padding: 1rem 0 3.25rem; }
  .timeline-year + .timeline-year { border-top: 1px solid color-mix(in srgb, var(--meta-divider) 13%, transparent); }

  .timeline-year__ghost {
    position: absolute;
    z-index: 3;
    top: 5.25rem;
    right: -3%;
    width: max-content;
    height: 0.82em;
    margin: 0;
    transform: none;
    color: var(--timeline-ghost-fill);
    font: 900 clamp(9rem, 20vw, 18rem) / 0.82 "JetBrains Mono", "Arial Narrow", sans-serif;
    letter-spacing: -0.1em;
    -webkit-text-stroke: 1px var(--timeline-ghost-line);
    -webkit-mask-image: linear-gradient(to left, #000 0 78%, transparent 100%);
    mask-image: linear-gradient(to left, #000 0 78%, transparent 100%);
    user-select: none;
    pointer-events: none;
  }

  :global(.dark) .timeline-register__eyebrow,
  :global(.dark) .timeline-register__meta,
  :global(.dark) .timeline-year__header {
    color: rgba(221, 233, 247, 0.5);
  }

  .timeline-year__header {
    position: relative;
    z-index: 5;
    display: flex;
    width: min(27rem, calc(100% - 4rem));
    align-items: center;
    gap: 0.75rem;
    margin: 0 0 1.5rem 4rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--signal-line) 20%, transparent);
    border-radius: 0.75rem;
    color: var(--meta-divider);
    background: color-mix(in srgb, var(--card-bg) 88%, transparent);
    box-shadow: 0 0.45rem 1.3rem var(--timeline-card-shadow);
    backdrop-filter: blur(12px);
    transition: border-color 180ms ease, color 180ms ease, background-color 180ms ease;
  }

  .timeline-year.is-current .timeline-year__header {
    border-color: color-mix(in srgb, var(--signal-line) 52%, transparent);
    color: color-mix(in oklch, var(--primary) 75%, var(--tw-prose-body, currentColor));
    background: color-mix(in srgb, var(--card-bg) 90%, var(--signal-soft));
  }

  .timeline-year__code,
  .timeline-year__count { white-space: nowrap; font-size: 0.69rem; font-weight: 800; }
  .timeline-year__rule { height: 1px; flex: 1; background: color-mix(in srgb, currentColor 28%, transparent); }
  .timeline-year__events { position: relative; z-index: 2; display: grid; gap: 2rem; }

  .timeline-item {
    position: relative;
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  .timeline-card.active { z-index: 4; }

  .timeline-node {
    position: relative;
    z-index: 4;
    display: grid;
    width: 2.6rem;
    height: 2.6rem;
    margin-top: 1.35rem;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--node-color) 52%, var(--card-bg));
    border-radius: 0.72rem;
    color: color-mix(in srgb, var(--node-color) 74%, var(--tw-prose-body, currentColor));
    background: color-mix(in srgb, var(--card-bg) 90%, var(--node-color));
    box-shadow: 0 0 0 0.35rem color-mix(in srgb, var(--card-bg) 92%, transparent);
    transform: rotate(45deg);
    transition: color 220ms ease, background-color 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
  }

  :global(.dark) .timeline-node {
    color: color-mix(in srgb, var(--node-color) 70%, white);
    background: color-mix(in srgb, var(--card-bg) 88%, var(--node-color));
  }

  .timeline-node__icon { width: 1.2rem; height: 1.2rem; transform: rotate(-45deg); }

  .timeline-card.active .timeline-node {
    border-color: var(--signal-line);
    color: var(--signal-ink);
    background: var(--signal);
    box-shadow: 0 0 0 0.35rem color-mix(in srgb, var(--card-bg) 92%, transparent), 0 0 1.25rem color-mix(in srgb, var(--signal-line) 34%, transparent);
  }

  .timeline-card__body {
    position: relative;
    min-width: 0;
    overflow: hidden;
    padding: 1.5rem;
    border: 1px solid color-mix(in srgb, var(--meta-divider) 17%, transparent);
    border-radius: 1rem;
    color: var(--tw-prose-body, currentColor);
    background: linear-gradient(135deg, color-mix(in srgb, var(--card-bg) 97%, var(--signal-soft)), var(--card-bg));
    box-shadow: 0 0.45rem 1.6rem var(--timeline-card-shadow);
    transform: scale(1);
    transform-origin: center;
    transition:
      transform 280ms cubic-bezier(0.2, 0.85, 0.3, 1),
      border-color 220ms ease,
      box-shadow 220ms ease,
      background-color 220ms ease;
  }

  :global(.dark) .timeline-card__body {
    background: color-mix(in srgb, var(--card-bg) 96%, #07121f);
    box-shadow: 0 0.6rem 1.8rem rgba(0, 0, 0, 0.14);
  }

  .timeline-card__marker {
    position: absolute;
    top: 1.2rem;
    bottom: 1.2rem;
    left: 0;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background: var(--signal-line);
    opacity: 0;
    transition: opacity 180ms ease;
  }

  .timeline-card.active .timeline-card__body {
    transform: scale(1.015);
    border-color: color-mix(in srgb, var(--signal-line) 54%, transparent);
    background: linear-gradient(135deg, color-mix(in srgb, var(--card-bg) 91%, var(--signal-soft)), var(--card-bg));
    box-shadow:
      0 0.85rem 2.4rem var(--timeline-active-shadow),
      0 0 1.6rem color-mix(in srgb, var(--signal-line) 16%, transparent),
      inset 0 0 0 1px color-mix(in srgb, var(--signal-line) 12%, transparent);
  }

  :global(.dark) .timeline-card.active .timeline-card__body {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--card-bg) 78%, var(--signal-line)),
      color-mix(in srgb, var(--card-bg) 91%, var(--signal-soft))
    );
    box-shadow:
      0 0.95rem 2.5rem rgba(0, 0, 0, 0.28),
      0 0 2rem color-mix(in srgb, var(--signal-line) 20%, transparent),
      inset 0 0 0 1px color-mix(in srgb, var(--signal-line) 12%, transparent);
  }

  .timeline-card.active .timeline-card__marker { opacity: 1; }

  .timeline-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }

  .timeline-card__head h3 {
    margin: 0 0 0.25rem;
    color: color-mix(in srgb, currentColor 92%, transparent);
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.35;
  }

  .timeline-card__organization,
  .timeline-card__date,
  .timeline-card__description { color: color-mix(in srgb, currentColor 68%, transparent); }
  .timeline-card__organization { font-size: 0.875rem; }
  .timeline-badge { flex: none; padding: 0.3rem 0.6rem; border-radius: 999px; font-size: 0.75rem; line-height: 1; }

  .timeline-card__date {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .timeline-card__dot { color: var(--signal-line); }
  .timeline-card__description { margin: 0 0 1rem; line-height: 1.7; }
  .timeline-gallery { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }

  .timeline-gallery__frame {
    width: min(13.5rem, 100%);
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--signal-soft) 45%, var(--card-bg));
  }

  .timeline-gallery img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .timeline-details { margin-bottom: 1rem; }
  .timeline-details h4 { margin: 0 0 0.5rem; font-size: 0.875rem; font-weight: 700; }
  .timeline-details ul { display: grid; gap: 0.25rem; margin: 0; padding: 0; list-style: none; }
  .timeline-details li { display: flex; gap: 0.5rem; color: color-mix(in srgb, currentColor 70%, transparent); font-size: 0.875rem; }
  .timeline-details li > span:first-child { color: var(--signal-line); }
  .timeline-skills { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1rem; }

  .timeline-skills span {
    padding: 0.28rem 0.55rem;
    border: 1px solid color-mix(in srgb, var(--signal-line) 18%, transparent);
    border-radius: 0.45rem;
    color: color-mix(in srgb, currentColor 72%, transparent);
    background: color-mix(in srgb, var(--signal-soft) 48%, transparent);
    font-size: 0.75rem;
  }

  .timeline-links { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; }

  .timeline-links a {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }

  .timeline-links a:hover { text-decoration: underline; text-underline-offset: 0.2em; }
  .timeline-links a:focus-visible { border-radius: 0.25rem; outline: 2px solid var(--primary); outline-offset: 3px; }

  @media (max-width: 720px) {
    .timeline-register { align-items: flex-start; padding: 1rem 1.1rem 0.85rem; }
    .timeline-register > div:first-child { display: grid; gap: 0.35rem; }
    .timeline-register__meta { display: grid; justify-items: end; gap: 0.3rem; font-size: 0.6rem; }
    .timeline-sequence { --rail-left: 2.35rem; padding-inline: 1rem; padding-bottom: 4.5rem; }
    .timeline-rail { top: 6.5rem; bottom: 5.5rem; }
    .timeline-year { padding-bottom: 2.25rem; }

    .timeline-year__ghost {
      z-index: 1;
      top: 4.3rem;
      right: -0.45rem;
      height: auto;
      margin-bottom: 0;
      transform: none;
      font-size: clamp(5.4rem, 28vw, 7.5rem);
      color: transparent;
      -webkit-text-stroke-color: var(--timeline-ghost-line-mobile);
      -webkit-mask-image: none;
      mask-image: none;
    }

    :global(.dark) .timeline-year__ghost {
      color: transparent;
    }

    .timeline-year__header {
      width: calc(100% - 2.9rem);
      margin: 0 0 1.2rem 2.9rem;
      padding: 0.48rem 0.6rem;
      backdrop-filter: blur(9px);
    }

    .timeline-year__code,
    .timeline-year__count { font-size: 0.61rem; }
    .timeline-year__events { gap: 1.35rem; }
    .timeline-item { grid-template-columns: 2.7rem minmax(0, 1fr); gap: 0.7rem; }

    .timeline-node {
      width: 2.25rem;
      height: 2.25rem;
      margin-top: 1.05rem;
      border-radius: 0.62rem;
    }

    .timeline-node__icon { width: 1rem; height: 1rem; }
    .timeline-card__body { padding: 1.1rem; border-radius: 0.85rem; }
    .timeline-card.active .timeline-card__body { transform: scale(1.01); }
    .timeline-card__head { display: grid; gap: 0.65rem; }
    .timeline-badge { width: max-content; }
    .timeline-card__head h3 { font-size: 1.05rem; }
    .timeline-card__date { gap: 0.35rem; font-size: 0.78rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .timeline-register strong,
    .timeline-rail span,
    .timeline-year__header,
    .timeline-node,
    .timeline-card__body,
    .timeline-card__marker { transition: none; }

    .timeline-year__header { backdrop-filter: none; }
    .timeline-card.active .timeline-card__body { transform: none; }
  }
</style>
