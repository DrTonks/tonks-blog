<script lang="ts">
  import { onMount } from 'svelte';
  import { i18n } from '../i18n/translation';
  import I18nKey from '../i18n/i18nKey';

  type Project = {
    id: string;
    title: string;
    description: string;
    image?: string;
    category?: string;
    techStack?: string[];
    status?: string;
    liveDemo?: string;
    sourceCode?: string;
    startDate?: string;
    endDate?: string;
    featured?: boolean;
    tags?: string[];
    award?: string;
    links?: string[] | string;
    demoUrl?: string;
    sourceUrl?: string;
  };

  let projects: Project[] = [];
  let loading = true;
  let error: string | null = null;

  onMount(async () => {
    try {
      const res = await fetch('/data/projects.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch projects.json');
      projects = await res.json();
    } catch (e: any) {
      console.error(e);
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  });

  $: awarded = projects.filter((p) => p.award && String(p.award).trim() !== '');
  $: involved = projects.filter((p) => p.category === 'web' || p.category === 'mobile');
  $: previewable = projects.filter(
    (p) => p.links && (Array.isArray(p.links) ? p.links.length > 0 : Boolean(p.links)),
  );
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
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300" aria-disabled>
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
          {#if (Array.isArray(project.links) && project.links.length > 0) || project.liveDemo || project.demoUrl || project.sourceCode || project.sourceUrl}
            <a href={(Array.isArray(project.links) ? project.links[0] : project.links) ?? project.liveDemo ?? project.demoUrl ?? project.sourceCode ?? project.sourceUrl} target="_blank" rel="noopener noreferrer" class="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
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
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300" aria-disabled>
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
          <a href={(Array.isArray(project.links) ? project.links[0] : project.links)} target="_blank" rel="noopener noreferrer" class="group bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden hover:shadow-lg transition-shadow duration-300">
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
              <div class="flex gap-3 text-sm">
                {#if project.links}
                  <span class="text-blue-600 dark:text-blue-400 hover:underline font-medium">预览</span>
                {/if}
              </div>
            </div>
          </a>
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
