<script lang="ts">
  import { onMount } from 'svelte';
  export let bangumiUserId: string;
  export let mode: string;
  export let localList: any[] = [];

  let loading = true;
  let error: string | null = null;
  let animeList: any[] = [];

  const BANGUMI_API_BASE = 'https://api.bgm.tv';

  async function fetchSubjectPersons(subjectId: number) {
    try {
      const response = await fetch(`${BANGUMI_API_BASE}/v0/subjects/${subjectId}/persons`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('fetchSubjectPersons error', e);
      return [];
    }
  }

  async function fetchBangumiCollection(userId: string, subjectType: number, type: number) {
    try {
      let allData: any[] = [];
      let offset = 0;
      const limit = 50;
      let hasMore = true;
      while (hasMore) {
        const res = await fetch(`${BANGUMI_API_BASE}/v0/users/${userId}/collections?subject_type=${subjectType}&type=${type}&limit=${limit}&offset=${offset}`);
        if (!res.ok) throw new Error(`Bangumi API error: ${res.status}`);
        const data = await res.json();
        if (data.data && data.data.length > 0) allData = [...allData, ...data.data];
        if (!data.data || data.data.length < limit) hasMore = false; else offset += limit;
        await new Promise(r => setTimeout(r, 100));
      }
      return { data: allData };
    } catch (e) {
      console.error('fetchBangumiCollection error', e);
      return null;
    }
  }

  async function processBangumiData(data: any, status: string) {
    if (!data || !data.data) return [];
    const detailedItems = await Promise.all(
      data.data.map(async (item: any) => {
        const subjectPersons = await fetchSubjectPersons(item.subject_id);
        const year = item.subject?.date || 'Unknown';
        const rating = item.rate ? Number.parseFloat(item.rate.toFixed(1)) : 0;
        const progress = item.ep_status || 0;
        const totalEpisodes = item.subject?.eps || progress;
        let studio = 'Unknown';
        if (Array.isArray(subjectPersons)) {
          const priorities = ['动画制作', '製作', '制作'];
          for (const relation of priorities) {
            const match = subjectPersons.find((p: any) => p.relation === relation);
            if (match?.name) {
              studio = match.name;
              break;
            }
          }
        }
        return {
          title: item.subject?.name_cn || item.subject?.name || 'Unknown Title',
          status,
          rating,
          cover: item.subject?.images?.medium || '/assets/anime/default.webp',
          description: (item.subject?.short_summary || item.subject?.name_cn || '').trimStart(),
          episodes: `${totalEpisodes} episodes`,
          year,
          genre: item.subject?.tags ? item.subject.tags.slice(0, 3).map((t: any) => t.name) : ['Unknown'],
          studio,
          link: `https://bgm.tv/subject/${item.subject.id}` || '#',
          progress,
          totalEpisodes,
          startDate: item.subject?.date || '',
          endDate: item.subject?.date || ''
        };
      })
    );
    return detailedItems;
  }

  onMount(async () => {
    loading = true;
    error = null;
    try {
      if (mode === 'local') {
        animeList = localList;
      } else {
        if (!bangumiUserId || bangumiUserId === 'your-user-id') {
          animeList = [];
        } else {
          const watchingData = await fetchBangumiCollection(bangumiUserId, 2, 3);
          const completedData = await fetchBangumiCollection(bangumiUserId, 2, 2);
          const watchingList = watchingData ? await processBangumiData(watchingData, 'watching') : [];
          const completedList = completedData ? await processBangumiData(completedData, 'completed') : [];
          animeList = [...watchingList, ...completedList];
        }
      }
    } catch (e: any) {
      console.error(e);
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  });

  function getStatusInfo(status: string) {
    switch (status) {
      case 'watching': return { text: '在看', class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: '▶' };
      case 'completed': return { text: '已看', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: '✓' };
      case 'planned': return { text: '计划', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: '⏰' };
      default: return { text: status, class: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: '?' };
    }
  }

  $: stats = {
    total: animeList.length,
    watching: animeList.filter(a => a.status === 'watching').length,
    completed: animeList.filter(a => a.status === 'completed').length,
    avgRating: (() => {
      const rated = animeList.filter(a => a.rating > 0);
      if (rated.length === 0) return '0.0';
      return (rated.reduce((s, a) => s + a.rating, 0) / rated.length).toFixed(1);
    })()
  };
</script>

<style>
  .spinner { width: 48px; height: 48px; border-radius: 50%; border: 4px solid rgba(0,0,0,0.08); border-top-color: rgba(59,130,246,1); animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

{#if loading}
  <div class="flex items-center justify-center py-12">
    <div class="spinner" role="status" aria-label="loading"></div>
  </div>
{:else if error}
  <div class="text-red-600 py-6">Error: {error}</div>
{:else}
  <div>
    <!-- stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="text-2xl">📊</div>
          <div>
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</div>
            <div class="text-sm text-blue-600/70 dark:text-blue-400/70">番剧总数</div>
          </div>
        </div>
      </div>
      <div class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="text-2xl">▶️</div>
          <div>
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.watching}</div>
            <div class="text-sm text-green-600/70 dark:text-green-400/70">在看</div>
          </div>
        </div>
      </div>
      <div class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="text-2xl">✅</div>
          <div>
            <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.completed}</div>
            <div class="text-sm text-purple-600/70 dark:text-purple-400/70">已看</div>
          </div>
        </div>
      </div>
      <div class="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-4">
        <div class="flex items-center gap-3">
          <div class="text-2xl">⭐</div>
          <div>
            <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.avgRating}</div>
            <div class="text-sm text-orange-600/70 dark:text-orange-400/70">平均评分</div>
          </div>
        </div>
      </div>
    </div>

    <!-- grid -->
    {#if animeList.length === 0}
      <div class="text-center py-12">
        <div class="text-5xl mb-4">😢</div>
        <h3 class="text-xl font-medium text-black/80 dark:text-white/80 mb-2">没有数据</h3>
      </div>
    {:else}
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
        {#each animeList as anime}
          <div class="group relative bg-[var(--card-bg)] border border-[var(--line-divider)] rounded-[var(--radius-large)] overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
            <div class="relative aspect-[2/3] overflow-hidden">
              <a href={anime.link} target="_blank" rel="noopener noreferrer" class="block w-full h-full">
                <img src={anime.cover} alt={anime.title} class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </a>
              <div class={`absolute top-2 left-2 px-2 py-1 rounded-md text-xs font-medium ${getStatusInfo(anime.status).class}`}>
                <span class="mr-1">{getStatusInfo(anime.status).icon}</span>
                <span>{getStatusInfo(anime.status).text}</span>
              </div>
              <div class="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                <svg class="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                <span>{anime.rating}</span>
              </div>
              {#if anime.status === 'watching'}
                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <div class="w-full bg-white/20 rounded-full h-1.5 mb-1">
                    <div class="bg-gradient-to-r from-emerald-400 to-teal-400 h-1.5 rounded-full transition-all duration-300" style={`width: ${(anime.totalEpisodes>0? (anime.progress/anime.totalEpisodes*100):0)}%`}></div>
                  </div>
              <div class="text-white text-xs font-medium">{anime.progress}/{anime.totalEpisodes} ({Math.round((anime.totalEpisodes>0? (anime.progress/anime.totalEpisodes*100):0))}%)</div>
                </div>
              {/if}
            </div>
            <div class="p-3">
              <h3 class="text-sm font-bold text-black/90 dark:text-white/90 mb-1 line-clamp-2 leading-tight">{anime.title}</h3>
              <p class="text-black/60 dark:text-white/60 text-xs mb-2 line-clamp-2">{anime.description}</p>
              <div class="space-y-1 text-xs">
                <div class="flex justify-between">
                  <span class="text-black/50 dark:text-white/50">年份</span>
                  <span class="text-black/70 dark:text-white/70">{anime.year}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-black/50 dark:text-white/50">制作方</span>
                  <span class="text-black/70 dark:text-white/70 truncate ml-2">{anime.studio}</span>
                </div>
                <div class="flex flex-wrap gap-1 mt-2">
                  {#each anime.genre as g}
                    <span class="px-1.5 py-0.5 bg-[var(--btn-regular-bg)] text-black/70 dark:text-white/70 rounded text-xs">{g}</span>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
