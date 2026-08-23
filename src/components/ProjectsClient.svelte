<script lang="ts">
  import { onMount } from 'svelte';
  import type { Project } from '../data/projects';
  import { i18n } from '../i18n/translation';
  import I18nKey from '../i18n/i18nKey';

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

  // “参与制作”优先打开源码；没有源码时仍可回退到项目预览。
  const getInvolvedUrl = (project: Project) => getSourceUrl(project) || getPreviewUrl(project);

  onMount(async () => {
    try {
      const res = await fetch('/data/projects.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch projects.json');
      projects = await res.json();
    } catch (e: unknown) {
      console.error(e);
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  $: awarded = projects.filter((p) => p.award && String(p.award).trim() !== '');
  $: involved = projects.filter((p) => p.category === 'web' || p.category === 'mobile');
  $: previewable = projects.filter((p) => Boolean(getPreviewUrl(p)));
  $: techSet = Array.from(new Set(projects.flatMap((p) => p.techStack || []))).sort();
</script>

{#if loading}
  <div>Loading...</div>
{:else if error}
  <div class="text-red-600">Error: {error}</div>
{:else}
  <!-- 获奖项目 -->
  {#if awarded.length > 0}
    <div class="mb-8">
      <h2 class="text-2xl font-bold text-black/90 dark:text-white/90 mb-4">获奖项目</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        {#each awarded as project}
          {#if (Array.isArray(project.links) && project.links.length > 0) || project.liveDemo || project.demoUrl || project.sourceCode || project.sourceUrl}
            <a href={(Array.isArray(project.links) ? project.links[0] : project.links) ?? project.liveDemo ?? project.demoUrl ?? project.sourceCode ?? project.sourceUrl} target="_blank" rel="noopener noreferrer" class="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
              {#if project.image}
                <div class="aspect-video overflow-hidden">
                  <img src={project.image} alt={project.title} class="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </div>
              {/if}
              <div class="p-6">
                <div class="flex items-start justify-between mb-3">
                  <h3 class="text-xl font-semibold text-black/90 dark:text-white/90">{project.title}</h3>
                  <span class="text-sm text-neutral-500 dark:text-neutral-400">{project.award}</span>
                </div>
                <p class="text-black/60 dark:text-white/60 mb-4 line-clamp-2">{project.description}</p>
                <div class="flex flex-wrap gap-2 mb-4">
                  {#each project.techStack?.slice(0,4) ?? [] as tech}
                    <span class="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">{tech}</span>
                  {/each}
                  {#if project.techStack && project.techStack.length > 4}
                    <span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 rounded">+{project.techStack.length - 4}</span>
                  {/if}
                </div>
              </div>
            </a>
          {:else}
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
              {#if project.image}
                <div class="aspect-video overflow-hidden">
                  <img src={project.image} alt={project.title} class="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </div>
              {/if}
              <div class="p-6">
                <div class="flex items-start justify-between mb-3">
                  <h3 class="text-xl font-semibold text-black/90 dark:text-white/90">{project.title}</h3>
                  <span class="text-sm text-neutral-500 dark:text-neutral-400">{project.award}</span>
                </div>
                <p class="text-black/60 dark:text-white/60 mb-4 line-clamp-2">{project.description}</p>
                <div class="flex flex-wrap gap-2 mb-4">
                  {#each project.techStack?.slice(0,4) ?? [] as tech}
                    <span class="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">{tech}</span>
                  {/each}
                  {#if project.techStack && project.techStack.length > 4}
                    <span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 rounded">+{project.techStack.length - 4}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- 参与制作 -->
  {#if involved.length > 0}
    <div class="mb-8">
      <h2 class="text-2xl font-bold text-black/90 dark:text-white/90 mb-4">参与制作</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each involved as project}
          {@const involvedUrl = getInvolvedUrl(project)}
          {#if involvedUrl}
            <a href={involvedUrl} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${project.title}${getSourceUrl(project) ? ' 的源代码' : ' 的预览'}`} class="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900">
              {#if project.image}
                <div class="aspect-video overflow-hidden">
                  <img src={project.image} alt={project.title} class="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </div>
              {/if}
              <div class="p-4">
                <div class="flex items-start justify-between mb-2">
                  <h3 class="text-lg font-semibold text-black/90 dark:text-white/90 line-clamp-1">{project.title}</h3>
                  <span class={`px-2 py-1 text-xs rounded-full shrink-0 ml-2 ${project.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : project.status === 'in-progress' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'}`}>
                    {i18n(project.status === 'completed' ? I18nKey.projectsCompleted : project.status === 'in-progress' ? I18nKey.projectsInProgress : I18nKey.projectsPlanned)}
                  </span>
                </div>
                <p class="text-black/60 dark:text-white/60 mb-3 text-sm line-clamp-2">{project.description}</p>
                <div class="flex flex-wrap gap-1 mb-3">
                  {#each project.techStack?.slice(0,3) ?? [] as tech}
                    <span class="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">{tech}</span>
                  {/each}
                  {#if project.techStack && project.techStack.length > 3}
                    <span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 rounded">+{project.techStack.length - 3}</span>
                  {/if}
                </div>
              </div>
            </a>
          {:else}
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
              {#if project.image}
                <div class="aspect-video overflow-hidden">
                  <img src={project.image} alt={project.title} class="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                </div>
              {/if}
              <div class="p-4">
                <div class="flex items-start justify-between mb-2">
                  <h3 class="text-lg font-semibold text-black/90 dark:text-white/90 line-clamp-1">{project.title}</h3>
                  <span class={`px-2 py-1 text-xs rounded-full shrink-0 ml-2 ${project.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : project.status === 'in-progress' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'}`}>
                    {i18n(project.status === 'completed' ? I18nKey.projectsCompleted : project.status === 'in-progress' ? I18nKey.projectsInProgress : I18nKey.projectsPlanned)}
                  </span>
                </div>
                <p class="text-black/60 dark:text-white/60 mb-3 text-sm line-clamp-2">{project.description}</p>
                <div class="flex flex-wrap gap-1 mb-3">
                  {#each project.techStack?.slice(0,3) ?? [] as tech}
                    <span class="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">{tech}</span>
                  {/each}
                  {#if project.techStack && project.techStack.length > 3}
                    <span class="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 rounded">+{project.techStack.length - 3}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- 可预览应用 -->
  {#if previewable.length > 0}
    <div class="mb-8">
      <h2 class="text-2xl font-bold text-black/90 dark:text-white/90 mb-4">可预览应用</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each previewable as project}
          {@const previewUrl = getPreviewUrl(project)}
          {@const sourceUrl = getSourceUrl(project)}
          <article class="group bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
            {#if project.image}
              <div class="aspect-video overflow-hidden">
                <img src={project.image} alt={project.title} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
            {/if}
            <div class="p-4">
              <div class="flex items-start justify-between mb-2">
                <h3 class="text-lg font-semibold text-black/90 dark:text-white/90 line-clamp-1">{project.title}</h3>
                <span class={`px-2 py-1 text-xs rounded-full shrink-0 ml-2 ${project.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : project.status === 'in-progress' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'}`}>
                  {i18n(project.status === 'completed' ? I18nKey.projectsCompleted : project.status === 'in-progress' ? I18nKey.projectsInProgress : I18nKey.projectsPlanned)}
                </span>
              </div>
              <p class="text-black/60 dark:text-white/60 mb-3 text-sm line-clamp-2">{project.description}</p>
              <div class="flex flex-wrap items-center gap-3 text-sm">
                {#if previewUrl}
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" class="font-medium text-blue-600 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400" aria-label={`预览 ${project.title}`}>
                    预览
                  </a>
                {/if}
                {#if sourceUrl}
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" class="font-medium text-neutral-600 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-neutral-300" aria-label={`查看 ${project.title} 的源代码`}>
                    源代码
                  </a>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 技术栈统计 -->
  <div class="mt-12 pt-8 border-t border-black/10 dark:border-white/10">
    <h2 class="text-2xl font-bold text-black/90 dark:text-white/90 mb-4">{i18n(I18nKey.projectsTechStack)}</h2>
    <div class="flex flex-wrap gap-2">
      {#each techSet as tech}
        <span class="px-3 py-1 text-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-full">{tech}</span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
