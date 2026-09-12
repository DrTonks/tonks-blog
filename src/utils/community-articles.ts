import {communityOverlayHost,communityOverlayPosition} from './community-overlay'

export interface CommunityArticle { title: string; url: string; headings: Array<{title: string; id: string}> }
let articles: CommunityArticle[] | undefined
let pending: Promise<CommunityArticle[]> | undefined

export function validateArticleIndex(value: unknown): CommunityArticle[] {
  if (!Array.isArray(value)) throw new Error('文章目录格式错误')
  return value.slice(0, 2000).map(item => {
    if (!item || typeof item.title !== 'string' || typeof item.url !== 'string' || !Array.isArray(item.headings)) throw new Error('文章目录格式错误')
    const url = new URL(item.url)
    if (url.origin !== 'https://blog.tonks.top' || !url.pathname.startsWith('/posts/') || url.username || url.password || url.search || url.hash) throw new Error('文章地址不可用')
    return {title:item.title.slice(0,200),url:url.href,headings:item.headings.slice(0,300).map((heading: {title:string;id:string}) => {
      if (typeof heading?.title !== 'string' || typeof heading.id !== 'string') throw new Error('小标题格式错误')
      return {title:heading.title.slice(0,200),id:heading.id.slice(0,400)}
    })}
  })
}

async function loadArticles() {
  if (articles) return articles
  if (!pending) pending = (async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch('/community/articles.json', {signal:controller.signal})
      if (!response.ok) throw new Error('目录暂时无法读取，请稍后重试')
      articles = validateArticleIndex(await response.json()); return articles
    } finally { clearTimeout(timer); pending = undefined }
  })()
  return pending
}

export function articleMention(article: CommunityArticle, heading?: CommunityArticle['headings'][number]): string {
  const title = `${article.title}${heading ? `：${heading.title}` : ''}`.replace(/([\\`*_[\]<>&])/g, '\\$1').replace(/[\r\n]/g,' ')
  const url = new URL(article.url)
  if (heading) url.hash = heading.id
  return `[@${title}](${url.href.replace(/\(/g,'%28').replace(/\)/g,'%29')})`
}

// Framework-independent picker used by blog forms and Vue chat composers.
export function attachArticlePicker(textarea: HTMLTextAreaElement, host: HTMLElement): () => void {
  const abort = new AbortController(), {signal} = abort
  const wrapper = document.createElement('span'); wrapper.className = 'community-article-control'
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '@ 文章'; toggle.className = 'community-article-toggle'
  toggle.setAttribute('aria-label','引用文章或小标题'); toggle.setAttribute('aria-expanded','false')
  const panel = document.createElement('div'); panel.className = 'community-article-picker'; panel.hidden = true
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','引用文章或小标题')
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = '搜索文章标题或小标题'; search.setAttribute('aria-label', search.placeholder)
  const back = document.createElement('button'); back.type = 'button'; back.textContent = '← 全部文章'; back.hidden = true
  const list = document.createElement('div'); list.className = 'community-article-results'
  const status = document.createElement('p'); status.setAttribute('role','status')
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭'; close.className = 'community-article-close'
  panel.append(search,back,list,status,close); wrapper.append(toggle); host.append(wrapper); communityOverlayHost(host).append(panel)
  let available: CommunityArticle[] = [], selected: CommunityArticle | undefined, trigger: {start:number;end:number} | undefined
  let open = false
  const position = () => {
    if (!open) return
    const owner = communityOverlayHost(host)
    if (panel.parentElement !== owner) owner.append(panel)
    Object.assign(panel.style,communityOverlayPosition(toggle,380,420))
  }
  const hide = (focus = false) => {open=false; panel.hidden=true;toggle.setAttribute('aria-expanded','false'); if(focus) textarea.focus()}
  const choose = (article:CommunityArticle, heading?:CommunityArticle['headings'][number]) => {
    const start = trigger?.start ?? textarea.selectionStart, end = trigger?.end ?? textarea.selectionEnd
    const insert = `${articleMention(article,heading)} `
    const limit = textarea.maxLength > 0 ? textarea.maxLength : 800
    if (textarea.value.length - (end-start) + insert.length > limit) {status.textContent=`最多 ${limit} 字，剩余空间不足以插入此引用。`;return}
    textarea.setRangeText(insert,start,end,'end'); trigger=undefined
    textarea.dispatchEvent(new Event('input',{bubbles:true})); hide(true)
  }
  const button = (label:string, action:()=>void, className='') => {
    const node=document.createElement('button'); node.type='button';node.textContent=label;node.className=className
    node.addEventListener('click',action); return node
  }
  const refresh = () => {
    list.replaceChildren(); back.hidden=!selected
    const query=search.value.trim().toLocaleLowerCase()
    let count=0
    for (const article of selected?[selected]:available) {
      const titleMatch=article.title.toLocaleLowerCase().includes(query)
      const headings=article.headings.filter(h=>titleMatch || h.title.toLocaleLowerCase().includes(query))
      if (!titleMatch && !headings.length) continue
      if (count++>=60) break
      const row=document.createElement('div');row.className='community-article-row'
      row.append(button(article.title,()=>choose(article),'community-article-title'))
      if(!selected && article.headings.length) row.append(button(`小标题 (${article.headings.length})`,()=>{selected=article;search.value='';refresh();search.focus()},'community-article-headings'))
      list.append(row)
      if(selected || (query && !titleMatch)) for(const heading of headings) {
        list.append(button(`${article.title}：${heading.title}`,()=>choose(article,heading),'community-article-heading'))
      }
    }
    status.textContent=count ? '点击文章标题直接引用；也可以选择具体小标题。' : '没有匹配的文章'
    if(count>60) status.textContent='已显示前 60 篇，请输入关键词缩小范围。'
  }
  const show = async (fromTyping=false) => {
    if(!fromTyping) trigger=undefined
    open=true;panel.hidden=false;toggle.setAttribute('aria-expanded','true');selected=undefined;search.value='';position();search.focus()
    status.textContent='正在读取文章目录…'
    try {available=await loadArticles(); if(open && !signal.aborted) refresh()}
    catch {if(open && !signal.aborted) status.textContent='文章目录暂时无法读取，关闭后可重试。'}
  }
  toggle.addEventListener('click',()=>open?hide(true):void show(),{signal})
  close.addEventListener('click',()=>hide(true),{signal})
  back.addEventListener('click',()=>{selected=undefined;refresh();search.focus()},{signal})
  search.addEventListener('input',refresh,{signal})
  panel.addEventListener('pointerdown',event=>event.stopPropagation(),{signal})
  textarea.addEventListener('input',(event)=>{
    if (!(event instanceof InputEvent) || event.isComposing || event.data !== '@') return
    const end=textarea.selectionStart
    if(textarea.value[end-1]==='@' && (end===1 || /\s/.test(textarea.value[end-2]!))) {trigger={start:end-1,end};void show(true)}
  },{signal})
  panel.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide(true)}
    if(event.key==='ArrowDown' && event.target===search){event.preventDefault();list.querySelector('button')?.focus()}
  },{signal})
  document.addEventListener('pointerdown',(event)=>{if(event.target instanceof Node&&!wrapper.contains(event.target)&&!panel.contains(event.target)) hide()},{signal})
  document.addEventListener('focusin',(event)=>{if(event.target instanceof Node&&!wrapper.contains(event.target)&&!panel.contains(event.target)&&event.target!==textarea) hide()},{signal})
  window.addEventListener('resize',position,{signal})
  document.addEventListener('scroll',position,{signal,capture:true})
  return ()=>{abort.abort();wrapper.remove();panel.remove()}
}
