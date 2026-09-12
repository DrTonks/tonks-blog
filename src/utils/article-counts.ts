const base=(import.meta.env.PUBLIC_SLEEPY_API_BASE || '/api').replace(/\/$/,'');
const cache=new Map<string,{count:number;at:number}>();
let observer:IntersectionObserver|undefined;
let generation=0;

export function initializeArticleCounts(){
  observer?.disconnect();const current=++generation;
  const queue:HTMLElement[]=[];let active=0;
  const show=(host:HTMLElement,count:number)=>{
    if(!host.isConnected)return;
    host.hidden=count===0;host.querySelector('span')!.textContent=String(count);
    host.setAttribute('aria-label',`查看文章 ${count} 条评论`);
  };
  async function work(){
    if(current!==generation)return;
    while(active<2 && queue.length){
      const host=queue.shift()!;const id=host.dataset.articleCount!;active++;
      void (async()=>{
        try{
          const cached=cache.get(id);
          if(cached && Date.now()-cached.at<60000){show(host,cached.count);return;}
          const response=await fetch(`${base}/blog/community/articles/${encodeURIComponent(id)}/comments`);
          if(!response.ok)return;
          const data=await response.json();
          if(data.success && Number.isSafeInteger(data.count) && data.count>=0){cache.set(id,{count:data.count,at:Date.now()});show(host,data.count);}
        }catch{/* Keep unavailable counters hidden. */}
        finally{active--;void work();}
      })();
    }
  }
  // Hidden counters have no geometry; observe their visible card instead.
  const counters=document.querySelectorAll<HTMLElement>('[data-article-count]');
  observer=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){observer?.unobserve(entry.target);const host=entry.target.querySelector<HTMLElement>('[data-article-count]');if(host)queue.push(host);}
    void work();
  },{rootMargin:'200px'});
  counters.forEach(host=>{const card=host.closest('.post-card');if(card)observer!.observe(card);});
}
