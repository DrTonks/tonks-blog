<script lang="ts">
  import { optimizedImage } from '../utils/optimized-image';
  import type { Project } from "../data/projects";
  import { i18n } from "../i18n/translation";
  import I18nKey from "../i18n/i18nKey";

  import { newestProjects, projectDate } from "../utils/project-gallery";
  import { projectMasonry } from "../utils/project-masonry";

  export let projects: Project[];

  type TechFamily = "ai" | "frontend" | "backend" | "language" | "infra" | "other";

  const techFamilyByAlias: Record<string, TechFamily> = {
    ai: "ai",
    llm: "ai",
    agent: "ai",
    tensorflow: "ai",
    hnsw: "ai",
    vue3: "frontend",
    vuejs: "frontend",
    react: "frontend",
    nextjs: "frontend",
    astro: "frontend",
    svelte: "frontend",
    html: "frontend",
    css: "frontend",
    tailwindcss: "frontend",
    framermotion: "frontend",
    threejs: "frontend",
    springboot: "backend",
    nodejs: "backend",
    python: "backend",
    flask: "backend",
    express: "backend",
    sql: "backend",
    mysql: "backend",
    postgresql: "backend",
    pgvector: "backend",
    sqlite: "backend",
    firebase: "backend",
    typescript: "language",
    javascript: "language",
    c: "language",
    lodash: "language",
    redux: "language",
    pinia: "language",
    docker: "infra",
  };

  const techFamilyPatterns: [RegExp, TechFamily][] = [
    [/^(ai|llm|agent|tensorflow|pytorch|transformers|huggingface)/, "ai"],
    [/^(vue|react|next|astro|svelte|tailwind|three|html|css|framer)/, "frontend"],
    [/^(springboot|node|python|flask|express|sql|mysql|postgres|pgvector|sqlite|firebase)/, "backend"],
    [/^(typescript|javascript|java|golang|rust|c$|lodash|redux|pinia)/, "language"],
    [/^(docker|kubernetes|nginx|pnpm|npm|yarn)/, "infra"],
  ];

  const getTechFamily = (tech: string): TechFamily => {
    const normalized = tech.toLowerCase().replace(/[\s._-]+/g, "");
    if (techFamilyByAlias[normalized]) return techFamilyByAlias[normalized];
    return techFamilyPatterns.find(([pattern]) => pattern.test(normalized))?.[1] ?? "other";
  };

  const getTechClass = (tech: string) => `tech-chip tech-chip--${getTechFamily(tech)}`;

  const firstLink = (links?: string[] | string) => {
    const link = Array.isArray(links) ? links.find((item) => item?.trim()) : links;
    return link?.trim() || undefined;
  };

  const getPreviewUrl = (project: Project) =>
    firstLink(project.links) || project.liveDemo?.trim() || project.demoUrl?.trim() || undefined;

  const getSourceUrl = (project: Project) =>
    project.sourceCode?.trim() || project.sourceUrl?.trim() || undefined;

  // Card navigation follows the requested priority: preview/link first, then source.
  const getCardUrl = (project: Project) => getPreviewUrl(project) || getSourceUrl(project);

  const getStatusText = (project: Project) =>
    i18n(
      project.status === "completed"
        ? I18nKey.projectsCompleted
        : project.status === "in-progress"
          ? I18nKey.projectsInProgress
          : I18nKey.projectsPlanned,
    );

  type ProjectFilter = "all" | "featured" | "in-progress" | "completed";
  let selectedFilter: ProjectFilter = "all";
  const hasAward = (project: Project) => Boolean(project.award?.trim());
  $: filters = [
    { id: "all" as const, label: "全部", count: projects.length },
    { id: "featured" as const, label: "代表作", count: projects.filter(p => p.featured).length },
    { id: "in-progress" as const, label: i18n(I18nKey.projectsInProgress), count: projects.filter(p => p.status === "in-progress").length },
    { id: "completed" as const, label: i18n(I18nKey.projectsCompleted), count: projects.filter(p => p.status === "completed").length },
  ];
  $: visibleProjects = newestProjects(projects).filter(project => selectedFilter === "all"
    || (selectedFilter === "featured" ? project.featured : project.status === selectedFilter));
</script>

<section class="project-gallery" aria-label="作品列表">
  <div class="project-filters" role="group" aria-label="筛选作品">
    {#each filters as filter}
      <button type="button" class:active={selectedFilter === filter.id}
        aria-pressed={selectedFilter === filter.id} aria-controls="project-grid"
        on:click={() => selectedFilter = filter.id}>
        <span>{filter.label}</span><span class="filter-count">{filter.count}</span>
      </button>
    {/each}
  </div>
  <p class="sr-only" role="status" aria-live="polite">当前显示 {visibleProjects.length} 个项目</p>
  <div class="project-grid" id="project-grid" use:projectMasonry={visibleProjects}>
    {#each visibleProjects as project (project.id)}
      {@const cardUrl = getCardUrl(project)}
      {@const sourceUrl = getSourceUrl(project)}
      {@const start = projectDate(project.startDate)}
      {@const end = projectDate(project.endDate)}
      <div class="project-item">
      <article class="project-card" data-project-id={project.id}>
        {#if cardUrl}
          <a class="project-card__hit" href={cardUrl} target="_blank" rel="noopener noreferrer"
            aria-label={`打开 ${project.title}`}></a>
        {/if}
        <div class="project-media">
          {#if project.image}
            <img src={optimizedImage(project.image)} alt={project.title} class="project-image" loading="lazy" />
          {/if}
          {#if hasAward(project)}
            <div class="project-award">
              <span class="award-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 13v5m-4 3h8m-6-3h4v3h-4z" />
                </svg>
              </span>
              <span class="award-text"><span class="sr-only">获奖：</span>{project.award}</span>
            </div>
          {/if}
        </div>
        <div class="project-content">
          <div class="project-title-row">
            <h2>{project.title}</h2>
            <div class="project-meta">
              <span class="status-label" class:status-progress={project.status === "in-progress"} class:status-completed={project.status === "completed"}>
                {getStatusText(project)}
              </span>
              {#if start}
                <span class="project-dates">
                  <time datetime={start.iso}>{start.label}</time>{#if end} — <time datetime={end.iso}>{end.label}</time>{:else if project.status === "in-progress"} — 至今{/if}
                </span>
              {/if}
            </div>
          </div>
          <p class="project-description">{project.description}{#if sourceUrl}{" "}<a class="project-source" href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${project.title} 的源码`}>源码<span aria-hidden="true"> ↗</span></a>{/if}</p>
          {#if project.techStack?.length}
            <div class="tech-list" aria-label="技术栈">
              {#each project.techStack as tech}
                <span class={getTechClass(tech)}>{tech}</span>
              {/each}
            </div>
          {/if}
        </div>
      </article>
      </div>
    {/each}
  </div>
  {#if visibleProjects.length === 0}
    <p class="project-empty">暂时没有符合条件的作品。</p>
  {/if}
</section>

<style>
  .project-gallery { container-type: inline-size; }
  .project-filters {
    display: flex; flex-wrap: wrap; gap: .5rem;
    padding: .9rem 0 1.15rem; margin-bottom: 1.25rem;
    border-block: 1px solid var(--project-accent-line);
  }
  .project-filters button {
    display: inline-flex; align-items: center; gap: .65rem;
    padding: .55rem .85rem; min-height: 2.75rem;
    border: 1px solid transparent; border-radius: .65rem;
    color: var(--text-secondary); background: transparent;
    font-size: .86rem; cursor: pointer;
    transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
  }
  .project-filters button:hover { background: var(--btn-regular-bg); color: var(--project-accent-strong); }
  .project-filters button.active {
    color: var(--project-accent-strong); border-color: var(--project-accent-line);
    background: var(--project-accent-soft); font-weight: 700;
  }
  .filter-count { font: 600 .75rem/1 "JetBrains Mono Variable", monospace; font-variant-numeric: tabular-nums; }
  .project-filters button:focus-visible { outline: 2px solid var(--project-accent); outline-offset: 3px; }
  .project-grid {
    --project-columns: 1;
    display: grid; grid-template-columns: repeat(var(--project-columns), minmax(0, 1fr));
    gap: 1rem; align-items: start;
  }
  .project-grid:global(.is-masonry) { grid-auto-rows: 1px; row-gap: 0; }
  .project-item { min-width: 0; align-self: start; }
  @container (min-width: 540px) { .project-grid { --project-columns: 2; } }
  @container (min-width: 800px) { .project-grid { --project-columns: 3; } }
  .project-card {
    display: block; width: 100%;
    position: relative; overflow: hidden; min-width: 0;
    border: 1px solid color-mix(in srgb, var(--project-accent-line) 65%, transparent);
    border-radius: calc(var(--radius-large) - .2rem);
    background: var(--industrial-surface);
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .project-card:hover, .project-card:focus-within {
    border-color: var(--project-accent);
    box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / 8%);
  }
  :global(.dark) .project-card { background: var(--industrial-surface); }
  :global(.dark) .project-card:hover, :global(.dark) .project-card:focus-within {
    box-shadow: 0 .4rem 1.2rem rgb(0 0 0 / 22%);
  }
  .project-card__hit { position: absolute; z-index: 2; inset: 0; border-radius: inherit; }
  .project-card__hit:focus-visible { outline: 2px solid var(--project-accent); outline-offset: -3px; }
  .project-media { position: relative; overflow: hidden; aspect-ratio: 16 / 9; background: var(--industrial-surface-hover); }
  .project-image { width: 100%; height: 100%; object-fit: cover; transition: transform 300ms ease; }
  .project-card:hover .project-image, .project-card:focus-within .project-image { transform: scale(1.025); }
  .project-award {
    position: absolute; z-index: 3; top: .65rem; left: .65rem; right: .65rem;
    display: grid; grid-template-columns: 2.25rem minmax(0, 1fr); align-items: start;
    color: var(--project-accent-strong); pointer-events: none;
  }
  .project-award::before {
    content: ""; position: absolute; inset: 0 auto auto 0;
    width: 2.25rem; height: 2.25rem;
    border: 1px solid var(--project-accent-line); border-radius: .6rem;
    background: var(--card-bg);
    box-shadow: 0 .15rem .6rem rgb(0 0 0 / 14%);
    transition: width 260ms ease, height 260ms ease;
  }
  .award-icon { position: relative; display: grid; place-items: center; width: 2.25rem; height: 2.25rem; }
  .award-icon svg { width: 1.15rem; height: 1.15rem; }
  .award-text {
    position: relative; align-self: center; padding: .5rem .65rem .5rem 0;
    font-size: .75rem; font-weight: 700; line-height: 1.25rem;
    opacity: 0; transform: translateX(-.3rem);
    transition: opacity 160ms ease, transform 220ms ease;
  }
  .project-card:hover .project-award::before, .project-card:focus-within .project-award::before { width: 100%; height: 100%; }
  .project-card:hover .award-text, .project-card:focus-within .award-text { opacity: 1; transform: none; transition-delay: 80ms; }
  @media (hover: none), (pointer: coarse) {
    .project-award::before { width: 100%; height: 100%; }
    .award-text { opacity: 1; transform: none; }
  }
  .project-content { padding: 1rem; }
  .project-title-row { display: flex; flex-direction: column; align-items: flex-start; gap: .45rem; margin-bottom: .65rem; }
  .project-title-row h2 { margin: 0; font-size: 1.08rem; font-weight: 750; line-height: 1.45; overflow-wrap: anywhere; }
  .project-meta { display: flex; align-items: center; flex-wrap: wrap; gap: .45rem .6rem; }
  .status-label {
    display: inline-flex; align-items: center; gap: .3rem;
    padding: .2rem .45rem; border-radius: .35rem;
    color: var(--text-secondary); border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    background: color-mix(in srgb, currentColor 4%, transparent);
    font-size: .68rem; font-weight: 600; line-height: 1.4; white-space: nowrap;
  }
  .status-progress { color: var(--project-accent-strong); border-color: var(--project-accent-line); }
  .status-completed { color: #28724b; border-color: rgb(40 114 75 / 35%); background: rgb(40 114 75 / 5%); }
  :global(.dark) .status-completed { color: #a0c6b0; border-color: rgb(160 198 176 / 40%); }
  :global(.dark) .status-label { background: rgb(255 255 255 / 3%); }
  .status-progress::before { content: ""; width: .3rem; height: .3rem; border-radius: 50%; background: currentColor; }
  .project-dates { color: var(--text-secondary); font-size: .68rem; line-height: 1.5; font-variant-numeric: tabular-nums; }
  .project-dates time { white-space: nowrap; }
  .project-description { margin: 0 0 .85rem; color: var(--text-secondary); font-size: .86rem; line-height: 1.65; overflow-wrap: anywhere; }
  .project-source {
    position: relative; z-index: 4; display: inline;
    color: var(--project-accent-strong); font: inherit; white-space: nowrap;
    text-decoration: underline; text-decoration-color: var(--project-accent-line); text-underline-offset: .2em;
  }
  .project-source:hover { text-decoration-color: currentColor; }
  .project-source:focus-visible { outline: 2px solid var(--project-accent); outline-offset: 3px; border-radius: .1rem; }
  .tech-list { display: flex; flex-wrap: wrap; gap: .35rem; }
  .tech-chip {
    --tech-chip-color: #94a3b8;
    padding: .22rem .45rem; border-radius: .4rem;
    border: 1px solid color-mix(in srgb, var(--tech-chip-color) 45%, transparent);
    background: color-mix(in srgb, var(--tech-chip-color) 8%, transparent);
    color: var(--text-secondary); font-size: .65rem; line-height: 1.4;
  }
  .tech-chip--ai { --tech-chip-color: #a78bfa; }
  .tech-chip--frontend { --tech-chip-color: #5cc8ff; }
  .tech-chip--backend { --tech-chip-color: #3dd6b0; }
  .tech-chip--language { --tech-chip-color: #91a8c5; }
  .tech-chip--infra { --tech-chip-color: #f0a86b; }
  :global(.dark) .tech-chip { background: rgb(255 255 255 / 3%); }
  .project-empty { padding: 2rem 0; text-align: center; color: var(--text-secondary); }
  @media (prefers-reduced-motion: reduce) {
    .project-card, .project-image, .project-award::before, .award-text, .project-filters button { transition: none; }
    .project-card:hover .award-text, .project-card:focus-within .award-text { transition-delay: 0ms; }
    .project-card:hover .project-image, .project-card:focus-within .project-image { transform: none; }
  }
</style>
