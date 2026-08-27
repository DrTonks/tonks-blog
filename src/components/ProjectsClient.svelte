<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import type { Project } from "../data/projects";
  import { i18n } from "../i18n/translation";
  import I18nKey from "../i18n/i18nKey";

  let projects: Project[] = [];
  let loading = true;
  let error: string | null = null;

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

  onMount(async () => {
    try {
      const response = await fetch("/data/projects.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch projects.json");
      projects = await response.json();
    } catch (caught: unknown) {
      console.error(caught);
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      loading = false;
    }
  });

  $: representative = projects.filter((project) => project.award && String(project.award).trim() !== "");
  $: involved = projects.filter((project) => project.category === "web" || project.category === "mobile");
  $: techSet = Array.from(new Set(projects.flatMap((project) => project.techStack || []))).sort();
</script>

{#if loading}
  <div class="project-state">正在载入项目索引…</div>
{:else if error}
  <div class="project-state project-state--error">项目索引载入失败：{error}</div>
{:else}
  {#if representative.length > 0}
    <section class="project-section" aria-labelledby="representative-projects">
      <header class="section-heading">
        <div>
          <span class="section-kicker">SELECTED / WORKS</span>
          <h2 id="representative-projects">代表作品</h2>
        </div>
        <span class="section-count">{String(representative.length).padStart(2, "0")}</span>
      </header>

      <div class="representative-grid">
        {#each representative as project, index}
          {@const cardUrl = getCardUrl(project)}
          <article class="project-card project-card--representative" data-project-id={project.id}>
            {#if cardUrl}
              <a class="project-card__hit" href={cardUrl} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${project.title}`}></a>
            {/if}
            {#if project.image}
              <div class="project-media">
                <img src={project.image} alt={project.title} class="project-image" loading="lazy" />
                <span class="project-index">PRJ-{String(index + 1).padStart(2, "0")}</span>
              </div>
            {/if}
            <div class="project-content">
              <div class="project-title-row">
                <h3>{project.title}</h3>
                <span class="award-label">
                  <Icon icon="material-symbols:trophy-outline-rounded" class="award-label__icon" aria-hidden="true" />
                  <span>{project.award}</span>
                </span>
              </div>
              <p>{project.description}</p>
              <div class="tech-list" aria-label="技术栈">
                {#each project.techStack?.slice(0, 5) ?? [] as tech}
                  <span>{tech}</span>
                {/each}
                {#if project.techStack && project.techStack.length > 5}
                  <span>+{project.techStack.length - 5}</span>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if involved.length > 0}
    <section class="project-section" aria-labelledby="involved-projects">
      <header class="section-heading">
        <div>
          <span class="section-kicker">CONTRIBUTION / INDEX</span>
          <h2 id="involved-projects">参与制作</h2>
        </div>
        <span class="section-count">{String(involved.length).padStart(2, "0")}</span>
      </header>

      <div class="involved-grid">
        {#each involved as project, index}
          {@const sourceUrl = getSourceUrl(project)}
          {@const cardUrl = getCardUrl(project)}
          <article class="project-card project-card--compact" data-project-id={project.id}>
            {#if cardUrl}
              <a class="project-card__hit" href={cardUrl} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${project.title}`}></a>
            {/if}
            {#if project.image}
              <div class="project-media">
                <img src={project.image} alt={project.title} class="project-image" loading="lazy" />
                <span class="project-index">{String(index + 1).padStart(2, "0")}</span>
                {#if sourceUrl}
                  <a class="project-source" href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${project.title} 的源码`}>
                    <span>源码</span><b aria-hidden="true">↗</b>
                  </a>
                {/if}
              </div>
            {/if}
            <div class="project-content">
              <div class="project-title-row">
                <h3>{project.title}</h3>
                <span class:status-completed={project.status === "completed"} class:status-progress={project.status === "in-progress"} class="status-label">
                  {getStatusText(project)}
                </span>
              </div>
              <p>{project.description}</p>
              <div class="tech-list" aria-label="技术栈">
                {#each project.techStack?.slice(0, 4) ?? [] as tech}
                  <span>{tech}</span>
                {/each}
                {#if project.techStack && project.techStack.length > 4}
                  <span>+{project.techStack.length - 4}</span>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <section class="stack-section" aria-labelledby="project-stack">
    <header class="section-heading section-heading--compact">
      <div>
        <span class="section-kicker">CAPABILITY / MATRIX</span>
        <h2 id="project-stack">{i18n(I18nKey.projectsTechStack)}</h2>
      </div>
      <span class="section-count">{String(techSet.length).padStart(2, "0")}</span>
    </header>
    <div class="stack-list">
      {#each techSet as tech}
        <span>{tech}</span>
      {/each}
    </div>
  </section>
{/if}

<style>
  .project-state {
    display: grid;
    min-height: 12rem;
    place-items: center;
    color: var(--btn-content);
    font-family: "JetBrains Mono Variable", monospace;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
  }

  .project-state--error {
    color: #dc2626;
  }

  .project-section + .project-section,
  .stack-section {
    margin-top: 3rem;
  }

  .section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    padding: 0 0.25rem 0.85rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--project-accent-line);
  }

  .section-heading h2 {
    margin: 0.2rem 0 0;
    color: color-mix(in srgb, currentColor 92%, transparent);
    font-size: 1.65rem;
    font-weight: 800;
  }

  .section-kicker,
  .section-count,
  .project-index,
  .project-source,
  .award-label,
  .status-label {
    font-family: "JetBrains Mono Variable", monospace;
    letter-spacing: 0.08em;
  }

  .section-kicker {
    color: var(--project-accent);
    font-size: 0.65rem;
    font-weight: 800;
  }

  .section-count {
    padding: 0.38rem 0.58rem;
    color: var(--project-accent-strong);
    border: 1px solid var(--project-accent-line);
    border-radius: 0.65rem;
    background: var(--project-accent-soft);
    font-size: 0.7rem;
    font-weight: 800;
  }

  .representative-grid,
  .involved-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }

  .project-card {
    position: relative;
    overflow: hidden;
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--project-accent-line) 58%, transparent);
    border-radius: calc(var(--radius-large) - 0.15rem);
    background:
      radial-gradient(circle at 100% 0, color-mix(in srgb, var(--project-accent-soft) 62%, transparent), transparent 42%),
      linear-gradient(145deg, color-mix(in srgb, var(--project-accent-soft) 24%, transparent), transparent 48%),
      var(--industrial-surface);
    transition:
      border-color var(--motion-signal-fast) ease,
      box-shadow var(--motion-signal-fast) ease;
  }

  :global(.dark) .project-card {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--project-panel-highlight) 42%, transparent), transparent 24%),
      var(--industrial-surface);
  }

  .project-card::after {
    content: "";
    position: absolute;
    z-index: 25;
    top: 0;
    right: 0;
    left: 0;
    height: 0.22rem;
    pointer-events: none;
    background: linear-gradient(90deg, var(--project-accent), color-mix(in srgb, var(--project-accent) 22%, transparent));
    transform: scaleX(0);
    transform-origin: 100% 50%;
    transition: transform var(--motion-signal-medium) var(--ease-cut);
  }

  .project-card:hover,
  .project-card:focus-within {
    border-color: var(--project-accent-line);
    box-shadow: 0 0.85rem 2rem var(--project-accent-glow);
  }

  :global(.dark) .project-card:hover,
  :global(.dark) .project-card:focus-within {
    box-shadow:
      0 0.85rem 2rem var(--project-panel-shadow),
      inset 0 1px 0 var(--project-panel-highlight);
  }

  .project-card:hover::after,
  .project-card:focus-within::after {
    transform: scaleX(1);
    transform-origin: 0 50%;
  }

  .project-card__hit {
    position: absolute;
    z-index: 20;
    inset: 0;
    border-radius: inherit;
  }

  .project-card__hit:focus-visible {
    outline: 2px solid var(--project-accent);
    outline-offset: -3px;
  }

  .project-media {
    position: relative;
    overflow: hidden;
    aspect-ratio: 16 / 8.6;
    background: var(--industrial-surface-hover);
  }

  .project-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 340ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .project-card:hover .project-image,
  .project-card:focus-within .project-image {
    transform: scale(1.035);
  }

  .project-index {
    position: absolute;
    top: 0.65rem;
    left: 0.65rem;
    padding: 0.35rem 0.45rem;
    color: var(--project-accent-strong);
    border: 1px solid var(--project-accent-line);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--project-accent-surface) 88%, transparent);
    box-shadow: 0 0.35rem 1.2rem var(--project-accent-glow);
    backdrop-filter: blur(0.45rem);
    font-size: 0.64rem;
    font-weight: 800;
  }

  :global(.dark) .project-index,
  :global(.dark) .project-source {
    box-shadow: inset 0 1px 0 var(--project-panel-highlight);
  }

  .project-source {
    position: absolute;
    z-index: 30;
    top: 0.65rem;
    right: 0.65rem;
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    padding: 0.35rem 0.48rem;
    color: var(--project-accent-strong);
    border: 1px solid var(--project-accent-line);
    border-radius: 0.55rem;
    background: color-mix(in srgb, var(--project-accent-surface) 90%, transparent);
    box-shadow: 0 0.35rem 1.2rem var(--project-accent-glow);
    backdrop-filter: blur(0.45rem);
    font-size: 0.64rem;
    font-weight: 800;
    transition:
      color var(--motion-signal-fast) ease,
      border-color var(--motion-signal-fast) ease,
      background-color var(--motion-signal-fast) ease,
      box-shadow var(--motion-signal-fast) ease;
  }

  .project-source b {
    font-size: 0.78rem;
    font-weight: 800;
    transition: transform var(--motion-signal-fast) var(--ease-signal);
  }

  .project-source:hover,
  .project-source:focus-visible {
    color: var(--project-accent-strong);
    border-color: var(--project-accent);
    background: color-mix(in srgb, var(--project-accent-surface) 78%, var(--card-bg));
    box-shadow: 0 0 0 2px var(--project-accent-soft), 0 0.45rem 1.35rem var(--project-accent-glow);
    outline: none;
  }

  :global(.dark) .project-source:hover,
  :global(.dark) .project-source:focus-visible {
    box-shadow:
      0 0 0 1px var(--project-accent-line),
      inset 0 1px 0 var(--project-panel-highlight);
  }

  .project-source:is(:hover, :focus-visible) b {
    transform: translate(0.08rem, -0.08rem);
  }

  .project-content {
    padding: 1rem;
  }

  .project-card--representative .project-content {
    padding: 1.25rem;
  }

  .project-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.65rem;
  }

  .project-title-row h3 {
    display: -webkit-box;
    min-width: 0;
    overflow: hidden;
    margin: 0;
    color: color-mix(in srgb, currentColor 92%, transparent);
    font-size: 1.08rem;
    font-weight: 800;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .project-card--representative .project-title-row h3 {
    font-size: 1.25rem;
  }

  .award-label,
  .status-label {
    flex: 0 0 auto;
    padding: 0.34rem 0.48rem;
    border-radius: 0.55rem;
    font-size: 0.6rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .award-label {
    display: inline-flex;
    max-width: 48%;
    align-items: center;
    gap: 0.32rem;
    overflow: hidden;
    color: var(--project-accent-strong);
    border: 1px solid var(--project-accent-line);
    text-overflow: ellipsis;
    background: var(--project-accent-surface);
    box-shadow:
      inset 0 0 0.8rem color-mix(in srgb, var(--project-accent-glow) 46%, transparent),
      0 0.25rem 1rem color-mix(in srgb, var(--project-accent-glow) 58%, transparent);
  }

  :global(.dark) .award-label {
    box-shadow: inset 0 1px 0 var(--project-panel-highlight);
  }

  .award-label :global(.award-label__icon) {
    width: 0.85rem;
    height: 0.85rem;
    flex: 0 0 auto;
    filter: drop-shadow(0 0 0.32rem var(--project-accent-glow));
  }

  :global(.dark) .award-label :global(.award-label__icon) {
    filter: none;
  }

  .award-label span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-label {
    color: var(--btn-content);
    background: var(--btn-regular-bg);
  }

  .status-completed {
    color: #166534;
    background: #dcfce7;
  }

  :global(.dark) .status-completed {
    color: #86efac;
    background: rgba(22, 101, 52, 0.34);
  }

  .status-progress {
    color: var(--project-accent-strong);
    border: 1px solid var(--project-accent-line);
    background: var(--project-accent-soft);
  }

  .project-content > p {
    display: -webkit-box;
    min-height: 2.8rem;
    overflow: hidden;
    margin: 0 0 0.85rem;
    color: color-mix(in srgb, currentColor 62%, transparent);
    font-size: 0.86rem;
    line-height: 1.4rem;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .tech-list,
  .stack-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .tech-list span,
  .stack-list span {
    padding: 0.32rem 0.56rem;
    color: color-mix(in srgb, var(--project-accent-strong) 78%, currentColor);
    border: 1px solid color-mix(in srgb, var(--project-accent-line) 72%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--project-accent-soft) 72%, var(--btn-regular-bg));
    font-size: 0.68rem;
    font-weight: 700;
  }

  .stack-section {
    padding-top: 1.75rem;
    border-top: 1px solid color-mix(in srgb, var(--project-accent-line) 55%, transparent);
  }

  .section-heading--compact {
    margin-bottom: 0.85rem;
    border-bottom: 0;
  }

  .stack-list span {
    position: relative;
    font-family: "JetBrains Mono Variable", monospace;
    font-size: 0.72rem;
    box-shadow: inset 0 0 0.7rem color-mix(in srgb, var(--project-accent-glow) 34%, transparent);
  }

  :global(.dark) .stack-list span {
    box-shadow: inset 0 1px 0 var(--project-panel-highlight);
  }

  /* Gold-on-dark stays legible without turning every metadata chip into a
     luminous badge. The main accent remains available for headings and focus
     states; only the project metadata labels are intentionally quietened. */
  :global(html.dark[data-accent-dark='gold']) .project-card .project-index,
  :global(html.dark[data-accent-dark='gold']) .project-card .project-source,
  :global(html.dark[data-accent-dark='gold']) .project-card .award-label,
  :global(html.dark[data-accent-dark='gold']) .project-card .status-label:not(.status-completed),
  :global(html.dark[data-accent-dark='gold']) .project-card .tech-list span,
  :global(html.dark[data-accent-dark='gold']) .stack-list span {
    color: color-mix(in srgb, var(--project-accent-strong) 68%, var(--content-meta));
    border-color: color-mix(in srgb, var(--project-accent-line) 56%, transparent);
    background: color-mix(in srgb, var(--project-accent-surface) 42%, var(--industrial-surface));
    box-shadow: inset 0 1px 0 var(--project-panel-highlight);
  }

  :global(html.dark[data-accent-dark='gold']) .project-card .project-source:is(:hover, :focus-visible) {
    border-color: color-mix(in srgb, var(--project-accent-line) 78%, transparent);
    background: color-mix(in srgb, var(--project-accent-surface) 54%, var(--industrial-surface));
  }

  @media (min-width: 769px) {
    .representative-grid,
    .involved-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1180px) {
    .involved-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .section-heading h2 {
      font-size: 1.35rem;
    }

    .award-label {
      max-width: 44%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .project-card,
    .project-card::after,
    .project-image {
      transition: none;
    }

  }
</style>
