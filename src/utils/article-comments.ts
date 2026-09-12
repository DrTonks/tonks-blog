import {attachCommunityEmojiPicker} from './community-editor';
import {subscribeEmojis,loadEmojiManifest} from './community-emojis';
import {getCommunityIdentityToken, getCommunityProfile, saveCommunityProfile, clearCommunityProfile, type CommunityProfile} from './community-identity';
import {getBlogClientId} from './visitor-id';
import {renderCommunityMarkdown, safeCommentUrl} from './community-markdown';
import './community-markdown.css';

type Block = {id:string; text:string};
type ArticleMap = {id:string; slug:string; version:string; blocks:Block[]};
type Comment = {id:number; parent_id:number|null; root_id:number; block_id:string|null; quote:string; content:string; nickname:string; website:string; created_at:string; status:string; is_admin:boolean; reply_count?:number; reply_to_name?:string};
type Result = {success:boolean; message?:string; comments:Comment[]; counts?:Record<string,number>; count?:number; next_before?:number|null; next_after?:number|null; status?:string};
const base = (import.meta.env.PUBLIC_SLEEPY_API_BASE || '/api').replace(/\/$/,'');
let teardown: (()=>void)|undefined;
const bubble = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 11.5c0 4.4-3.6 7.5-8 7.5H9l-4 3v-5C3.1 15.6 2 13.7 2 11.5 2 7.1 6 4 11 4s9 3.1 9 7.5Z"/></svg>';
function element<K extends keyof HTMLElementTagNameMap>(tag:K, className='', text='') {
  const el = document.createElement(tag); el.className=className; el.textContent=text; return el;
}
function button(text:string, action:()=>void, className='') {
  const el=element('button',className,text); el.type='button'; el.addEventListener('click',action); return el;
}

export function initializeArticleComments() {
  const section=document.querySelector<HTMLElement>('[data-article-comments]');
  if(section?.dataset.ready==='true') return;
  teardown?.(); teardown=undefined;
  const data=document.querySelector<HTMLScriptElement>('[data-article-comment-map]');
  const dialog=document.querySelector<HTMLDialogElement>('[data-ac-dialog]');
  if(!section || !dialog || !data) return;
  section.dataset.ready='true';
  const article=JSON.parse(data.textContent || '{}') as ArticleMap;
  const blocks=new Map(article.blocks.map(b=>[b.id,b.text]));
  const controller=new AbortController(); const {signal}=controller;
  const quoteObserver=new ResizeObserver(entries=>{for(const {target} of entries){
    const p=target as HTMLElement;const toggle=p.parentElement?.querySelector<HTMLButtonElement>('[data-quote-toggle]');
    if(toggle)toggle.hidden=p.scrollHeight<=parseFloat(getComputedStyle(p).lineHeight)*3+1;
  }});
  const emojiContents=new Map<HTMLElement,string>();
  const unsubscribeEmojis=subscribeEmojis(()=>{for(const [host,text] of emojiContents){if(host.isConnected)renderCommunityMarkdown(host,text);else emojiContents.delete(host);}});
  void loadEmojiManifest().catch(()=>{});
  const q=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
  const main=section.querySelector<HTMLElement>('[data-ac-main-list]')!;
  const mainMore=section.querySelector<HTMLButtonElement>('[data-ac-main-more]')!;
  const list=q<HTMLElement>('[data-ac-dialog-list]'), more=q<HTMLButtonElement>('[data-ac-dialog-more]');
  const form=q<HTMLFormElement>('[data-ac-form]'), input=form.elements.namedItem('content') as HTMLTextAreaElement;
  const identity=q<HTMLFormElement>('[data-ac-identity]'), adminForm=q<HTMLFormElement>('[data-ac-admin-form]');
  const discussion=q<HTMLElement>('[data-ac-discussion]'), quote=q<HTMLElement>('[data-ac-quote]');
  const title=q<HTMLElement>('#ac-dialog-title'), status=q<HTMLElement>('[data-ac-status]');
  let activeBlock:string|null=null, reply:Comment|null=null, mainCursor:number|null=null, cursor:number|null=null;
  let counts:Record<string,number>={}, total=0, requestGeneration=0, mainGeneration=0, closingTimer:ReturnType<typeof setTimeout>|undefined;
  let profile:CommunityProfile=getCommunityProfile(), ephemeral=false, focusReturn:HTMLElement|null=null;
  let oldOverflow='', locked=false, sending=false, secret='';
  try{secret=localStorage.getItem('admin_secret') || '';}catch{}
  const endpoint=`${base}/blog/community/articles/${encodeURIComponent(article.id)}`;
  const drafts=new Map<string,string>();
  const draftStorage=`tonks_article_drafts:${article.id}`;
  try{
    const saved=JSON.parse(sessionStorage.getItem(draftStorage) || '{}');
    for(const [key,value] of Object.entries(saved))if(typeof value==='string')drafts.set(key,value.slice(0,800));
  }catch{}
  function persistDrafts(){try{sessionStorage.setItem(draftStorage,JSON.stringify(Object.fromEntries(drafts)));}catch{}}
  const draftKey=()=>`${activeBlock || 'article'}:${reply?.id || 0}`;
  async function api(path='', init:RequestInit={}, overrideSecret=secret):Promise<Result> {
    const response=await fetch(`${endpoint}/comments${path}`,{...init,signal,headers:{'Accept':'application/json','X-Client-ID':getBlogClientId(),'X-Community-Identity':getCommunityIdentityToken(),...(init.body?{'Content-Type':'application/json'}:{}),...(overrideSecret?{'X-Admin-Secret':overrideSecret}:{}),...init.headers}});
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('评论服务暂时不可用，请稍后重试');
    const result=await response.json();
    if(!response.ok || !result.success) throw new Error(result.message || '留言暂时无法读取，请稍后重试');
    return result;
  }
  function clearContent(host:HTMLElement,...nodes:Node[]){
    host.querySelectorAll('.ac-quote p').forEach(p=>quoteObserver.unobserve(p));
    for(const node of emojiContents.keys())if(host.contains(node))emojiContents.delete(node);
    host.replaceChildren(...nodes);
  }
  function showError(host:HTMLElement,error:unknown,retry:()=>void) {
    if(signal.aborted) return;
    clearContent(host,element('p','ac-muted',error instanceof Error?error.message:'读取失败'),button('重试',retry,'ac-more'));
  }
  function updateCounts(result:Result) {
    if(!result.counts) return;
    counts=result.counts; total=result.count || 0;
    section!.querySelector('[data-ac-total]')!.textContent=total?String(total):'';
    document.querySelectorAll<HTMLButtonElement>('.ac-paragraph-button').forEach(b=>{
      const n=counts[b.dataset.block!] || 0;
      b.dataset.count=String(n); b.querySelector('span')!.textContent=n?String(n):'';
      b.setAttribute('aria-label',n?`查看本段 ${n} 条评论`:'评论这一段');
    });
    updateTitle();
  }
  function updateTitle() {
    if(discussion.hidden) return;
    title.replaceChildren(document.createTextNode(activeBlock?'本段评论':'文章留言'));
    const n=activeBlock?(counts[activeBlock] || 0):total;
    if(n) title.append(element('span','',String(n)));
  }
  let cancelParagraphHint=()=>{};
  function revealParagraph(target:HTMLElement){
    cancelParagraphHint();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame=0, timer:ReturnType<typeof setTimeout>|undefined;
    let previousY=window.scrollY, stableSince=performance.now();
    const started=stableSince;
    cancelParagraphHint=()=>{cancelAnimationFrame(frame);if(timer)clearTimeout(timer);target.classList.remove('ac-highlight');};
    target.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});
    const show=()=>{
      if(signal.aborted || !target.isConnected)return;
      target.classList.add('ac-highlight');
      timer=setTimeout(()=>target.classList.remove('ac-highlight'),1800);
    };
    const settle=(now:number)=>{
      if(signal.aborted || !target.isConnected)return;
      const y=window.scrollY;
      if(Math.abs(y-previousY)>.5)stableSince=now;
      previousY=y;
      if(now-stableSince>=120 || now-started>=2500)show();
      else frame=requestAnimationFrame(settle);
    };
    // Only watch while this requested scroll is moving; no permanent scroll listener.
    frame=requestAnimationFrame(reduced?show:settle);
  }
  function showQuote(host:HTMLElement,text:string,block:string|null,jump=false) {
    host.querySelectorAll('p').forEach(p=>quoteObserver.unobserve(p));
    host.replaceChildren(); host.hidden=!text;
    if(!text) return;
    host.classList.remove('is-expanded'); host.append(element('p','',text));
    if(!jump){
    const toggle=button('展开',()=>{
      const expanded=host.classList.toggle('is-expanded');toggle.textContent=expanded?'收起':'展开';toggle.setAttribute('aria-expanded',String(expanded));
    });
    toggle.dataset.quoteToggle='';toggle.hidden=true;toggle.setAttribute('aria-expanded','false');host.append(toggle);
    quoteObserver.observe(host.querySelector('p')!);
    }
    host.classList.toggle('ac-quote--summary',jump);
    if(block && !blocks.has(block)) host.append(element('small','','原文已更新或移除'));
    else if(jump && block) host.append(button('查看段落 ↗',()=>{
      const target=document.querySelector<HTMLElement>(`[data-comment-block="${CSS.escape(block)}"]`);
      if(!target) return;
      if(dialog!.open)close(true);
      target.querySelector<HTMLButtonElement>('.ac-paragraph-button')?.focus({preventScroll:true});
      revealParagraph(target);
    }));
  }
  function renderComment(comment:Comment,showContext:boolean) {
    const row=element('article','ac-comment community-comment'), avatar=element('span','ac-avatar community-comment__avatar',comment.nickname.slice(0,1));
    if(comment.status==='published') {
      const img=element('img');img.alt='';img.loading='lazy';img.decoding='async';
      img.src=`${endpoint}/avatar/${comment.id}`;
      img.addEventListener('error',()=>{if(!img.dataset.fallback){img.dataset.fallback='true';img.src+= '?fallback=1';}else img.remove();},{signal});
      avatar.append(img);
    }
    const body=element('div'), name=element('div','ac-comment-name community-comment__meta',comment.nickname || '已删除');
    if(comment.website && safeCommentUrl(comment.website)){
      const link=element('a','',comment.nickname);link.href=safeCommentUrl(comment.website)!;link.rel='nofollow noopener noreferrer';link.target='_blank';name.replaceChildren(link);
    }
    if(comment.is_admin) name.append(element('span','ac-badge','站长'));
    if(comment.reply_to_name) name.append(element('span','',`回复 ${comment.reply_to_name}`));
    if(comment.status==='pending') name.append(element('span','ac-badge','待审核'));
    if(comment.status==='rejected') name.append(element('span','ac-badge','未通过'));
    name.classList.add('community-comment__name');body.append(name);
    if(showContext && comment.quote){const ref=element('blockquote','ac-quote');showQuote(ref,comment.quote,comment.block_id,true);body.append(ref);}
    const content=element('div','ac-comment-body community-comment__content');renderCommunityMarkdown(content,comment.content);emojiContents.set(content,comment.content);body.append(content);
    const actions=element('div','ac-comment-actions');
    const time=element('time','community-comment__time',new Date(comment.created_at).toLocaleDateString('zh-CN'));time.dateTime=comment.created_at;name.append(time);
    if(comment.status==='published') actions.append(button('↳ 回复',()=>open(comment.block_id,comment,true),'community-comment__reply-button'));
    if(secret && comment.status!=='deleted') {
      const manage=async(method:string,state?:string)=>{
        try{await api(`/${comment.id}`,{method,body:state?JSON.stringify({status:state}):undefined});await refresh();}catch(e){status.textContent=(e as Error).message;}
      };
      if(comment.status!=='published') actions.append(button('通过',()=>{void manage('PATCH','published');}));
      let confirming=false;
      const remove=button('删除',()=>{if(confirming){void manage('DELETE');return;}confirming=true;remove.textContent='确认删除';}); actions.append(remove);
    }
    body.append(actions);
    if(comment.reply_count) {
      const replies=element('div','ac-replies'); replies.hidden=true;
      const toggle=button(`展开 ${comment.reply_count} 条回复`,()=>{void toggleReplies();},'ac-more');
      let loaded=false,after:number|null=null;
      async function loadReplies(){
        toggle.disabled=true;
        try{
          const result=await api(`?root=${comment.id}${after?`&after=${after}`:''}`);
          if(!loaded)clearContent(replies);
          replies.querySelector('[data-more-replies]')?.remove();
          result.comments.forEach(c=>replies.append(renderComment(c,false)));
          after=result.next_after || null;
          if(after){const next=button('更多回复',()=>{void loadReplies();},'ac-more');next.dataset.moreReplies='';replies.append(next);}
          loaded=true;replies.hidden=false;toggle.textContent='收起回复';
        }catch(e){showError(replies,e,()=>{void loadReplies();});replies.hidden=false;}finally{toggle.disabled=false;}
      }
      async function toggleReplies(){if(!loaded) await loadReplies();else{replies.hidden=!replies.hidden;toggle.textContent=replies.hidden?`展开 ${comment.reply_count} 条回复`:'收起回复';}}
      body.append(toggle,replies);
    }
    row.append(avatar,body);return row;
  }
  async function loadMain(append=false) {
    const generation=++mainGeneration;mainMore.disabled=true;
    try{
      const result=await api(append&&mainCursor?`?before=${mainCursor}`:'');
      if(generation!==mainGeneration)return;
      if(!append)clearContent(main);
      result.comments.forEach(c=>main.append(renderComment(c,true)));
      if(!main.children.length)main.append(element('p','ac-muted','还没有留言，来聊聊这篇文章吧。'));
      mainCursor=result.next_before || null;mainMore.hidden=!mainCursor;updateCounts(result);
    }catch(e){if(generation!==mainGeneration)return;if(!append)showError(main,e,()=>{void loadMain();});else mainMore.textContent='读取失败，点击重试';}finally{if(generation===mainGeneration)mainMore.disabled=false;}
  }
  async function loadDialog(append=false) {
    const generation=++requestGeneration;more.disabled=true;
    const params=new URLSearchParams();if(activeBlock)params.set('block',activeBlock);if(append&&cursor)params.set('before',String(cursor));
    try{
      const result=await api(`?${params}`);if(generation!==requestGeneration)return;
      if(!append)clearContent(list);result.comments.forEach(c=>list.append(renderComment(c,!activeBlock)));
      if(!list.children.length)list.append(element('p','ac-muted','还没有留言。'));
      cursor=result.next_before || null;more.hidden=!cursor;updateCounts(result);
    }catch(e){if(generation===requestGeneration)showError(list,e,()=>{void loadDialog();});}finally{if(generation===requestGeneration)more.disabled=false;}
  }
  async function refresh(){await Promise.all([loadMain(),dialog!.open?loadDialog():Promise.resolve()]);}
  function restoreDraft(){input.value=drafts.get(draftKey()) || '';updateLength(true);}
  function updateLength(syncPreview=false){q('[data-ac-length]').textContent=`${input.value.length} / 800`;if(syncPreview)input.dispatchEvent(new Event('community:content-sync'));}
  function profileName(){q('[data-ac-profile]').textContent=profile.nickname || '留言身份';}
  const inline=section.querySelector<HTMLFormElement>('[data-ac-inline]')!;
  const inlineInput=inline.elements.namedItem('content') as HTMLTextAreaElement;
  const inlineStatus=inline.querySelector<HTMLElement>('[data-comment-form-status]')!;
  const inlineToggle=section.querySelector<HTMLButtonElement>('[data-ac-write]')!;
  let inlineDirty=false,inlineSending=false;
  function syncInlineIdentity(){
    if(inlineDirty)return;
    const current=ephemeral?profile:getCommunityProfile();
    for(const key of ['nickname','email','website'] as const)(inline.elements.namedItem(key) as HTMLInputElement).value=current[key];
    (inline.elements.namedItem('remember') as HTMLInputElement).checked=!ephemeral;
  }
  function syncInlineContent(){
    inline.querySelector('[data-content-count]')!.textContent=String(inlineInput.value.length);
    drafts.set('footer',inlineInput.value);persistDrafts();
    inlineInput.dispatchEvent(new Event('community:content-sync'));
  }
  function toggleInline(){
    const show=inline.hidden;
    if(show)syncInlineIdentity();
    inline.hidden=!show;inline.setAttribute('aria-hidden',String(!show));
    inlineToggle.setAttribute('aria-expanded',String(show));
    section!.querySelector<HTMLElement>('[data-comment-description]')!.hidden=!show;
    if(show)inlineInput.focus({preventScroll:true});else inlineToggle.focus({preventScroll:true});
  }
  inlineInput.value=drafts.get('footer') || '';
  attachCommunityEmojiPicker(inlineInput,inline.querySelector<HTMLElement>('.community-comment-form__content')!,{articles:false});
  syncInlineContent();
  inlineInput.addEventListener('input',()=>{
    inline.querySelector('[data-content-count]')!.textContent=String(inlineInput.value.length);
    drafts.set('footer',inlineInput.value);persistDrafts();
  },{signal});
  for(const key of ['nickname','email','website','remember'])(inline.elements.namedItem(key) as HTMLInputElement).addEventListener('input',()=>{inlineDirty=true;},{signal});
  window.addEventListener('focus',syncInlineIdentity,{signal});
  inline.addEventListener('submit',async e=>{
    e.preventDefault();if(inlineSending)return;syncInlineIdentity();if(!inline.reportValidity())return;
    const content=inlineInput.value.trim();if(!content){inlineInput.focus();return;}
    const values=new FormData(inline);
    const submittedProfile={nickname:String(values.get('nickname')).trim(),email:String(values.get('email')).trim(),website:String(values.get('website')).trim()};
    profile=submittedProfile;ephemeral=!values.has('remember');
    if(ephemeral)clearCommunityProfile();else saveCommunityProfile(profile);
    inlineDirty=false;
    const submit=inline.querySelector<HTMLButtonElement>('[type=submit]')!;
    inlineSending=true;submit.disabled=true;inlineStatus.textContent='正在提交…';
    try{
      const result=await api('',{method:'POST',body:JSON.stringify({...submittedProfile,content,block_id:null,parent_id:null,version:article.version})});
      if(inlineInput.value.trim()===content){inlineInput.value='';syncInlineContent();}
      inlineStatus.textContent=result.message || '已提交';await refresh();
    }catch(error){if(!signal.aborted)inlineStatus.textContent=(error as Error).message;}
    finally{inlineSending=false;submit.disabled=false;}
  },{signal});
  function showDiscussion(){identity.hidden=true;adminForm.hidden=true;discussion.hidden=false;updateTitle();}
  function editIdentity(){
    if(!ephemeral)profile=getCommunityProfile();
    for(const key of ['nickname','email','website'] as const)(identity.elements.namedItem(key) as HTMLInputElement).value=profile[key];
    discussion.hidden=true;adminForm.hidden=true;identity.hidden=false;title.textContent='留言身份';
    (identity.elements.namedItem('nickname') as HTMLInputElement).focus();
  }
  function begin(){
    if(!ephemeral)profile=getCommunityProfile();
    if(!profile.nickname || !profile.email){editIdentity();return;}
    showDiscussion();q('[data-ac-start]').hidden=true;form.hidden=false;profileName();input.focus();
  }
  function open(block:string|null=null,target:Comment|null=null,compose=false){
    if(dialog!.open) drafts.set(draftKey(),input.value);
    activeBlock=block;reply=target;status.textContent='';cursor=null;
    q('[data-ac-reply-label]').textContent=reply?`回复 ${reply.nickname}`:'';
    q('[data-ac-cancel-reply]').hidden=!reply;
    showDiscussion();showQuote(quote,block?(blocks.get(block) || target?.quote || ''):'',block);
    form.hidden=true;q('[data-ac-start]').hidden=false;restoreDraft();
    if(!dialog!.open){
      focusReturn=document.activeElement as HTMLElement;oldOverflow=document.documentElement.style.overflow;
      document.documentElement.style.overflow='hidden';locked=true;dialog!.showModal();
    }
    clearContent(list,element('p','ac-muted','正在读取留言…'));void loadDialog();
    if(compose || (block && (counts[block] || 0)===0))begin();else title.focus();
  }
  function close(immediate=false){
    drafts.set(draftKey(),input.value);persistDrafts();
    if(closingTimer)clearTimeout(closingTimer);
    const finish=()=>{dialog!.close();dialog!.classList.remove('is-closing');if(locked)document.documentElement.style.overflow=oldOverflow;locked=false;focusReturn?.focus({preventScroll:true});};
    if(immediate || matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
    else{dialog!.classList.add('is-closing');closingTimer=setTimeout(finish,160);}
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();},{signal});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom)close();}},{signal});
  q('[data-ac-close]').addEventListener('click',()=>close(),{signal});
  section.querySelector('[data-ac-write]')!.addEventListener('click',toggleInline,{signal});
  q('[data-ac-start]').addEventListener('click',begin,{signal});q('[data-ac-profile]').addEventListener('click',editIdentity,{signal});
  q('[data-ac-identity-back]').addEventListener('click',()=>{showDiscussion();q('[data-ac-start]').focus();},{signal});
  q('[data-ac-cancel-reply]').addEventListener('click',()=>{drafts.set(draftKey(),input.value);reply=null;q('[data-ac-reply-label]').textContent='';q('[data-ac-cancel-reply]').hidden=true;restoreDraft();},{signal});
  identity.addEventListener('submit',e=>{
    e.preventDefault();const values=new FormData(identity);
    profile={nickname:String(values.get('nickname')).trim(),email:String(values.get('email')).trim(),website:String(values.get('website')).trim()};
    ephemeral=!values.has('remember');if(!ephemeral)saveCommunityProfile(profile);else clearCommunityProfile();syncInlineIdentity();begin();
  },{signal});
  input.addEventListener('input',()=>{updateLength();drafts.set(draftKey(),input.value);persistDrafts();},{signal});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(sending)return;
    const content=input.value.trim();if(!content)return;
    if(!ephemeral)profile=getCommunityProfile();if(!profile.nickname || !profile.email){editIdentity();return;}
    const submittedKey=draftKey();
    sending=true;const submit=form.querySelector<HTMLButtonElement>('[type=submit]')!;submit.disabled=true;status.textContent='正在提交…';
    try{
      const result=await api('',{method:'POST',body:JSON.stringify({...profile,content,block_id:activeBlock,parent_id:reply?.id || null,version:article.version})});
      if(drafts.get(submittedKey)?.trim()===content)drafts.delete(submittedKey);persistDrafts();if(draftKey()===submittedKey && input.value.trim()===content)input.value='';updateLength(true);status.textContent=result.message || '已提交';await refresh();
    }catch(e){if(!signal.aborted)status.textContent=(e as Error).message;}finally{sending=false;submit.disabled=false;}
  },{signal});
  mainMore.addEventListener('click',()=>{void loadMain(true);},{signal});more.addEventListener('click',()=>{void loadDialog(true);},{signal});
  attachCommunityEmojiPicker(input,q('[data-ac-editor]'),{articles:false});
  section.querySelector('[data-ac-admin]')!.addEventListener('click',()=>{
    open();discussion.hidden=true;identity.hidden=true;adminForm.hidden=false;title.textContent='管理员模式';
    (adminForm.elements.namedItem('secret') as HTMLInputElement).focus();
  },{signal});
  q('[data-ac-admin-back]').addEventListener('click',showDiscussion,{signal});
  q('[data-ac-admin-out]').addEventListener('click',()=>{secret='';try{localStorage.removeItem('admin_secret');}catch{}showDiscussion();void refresh();},{signal});
  adminForm.addEventListener('submit',async e=>{
    e.preventDefault();const next=(adminForm.elements.namedItem('secret') as HTMLInputElement).value;
    try{await api('',{},next);secret=next;try{localStorage.setItem('admin_secret',next);}catch{}showDiscussion();void refresh();}
    catch(e){q('[data-ac-admin-status]').textContent=(e as Error).message;}
  },{signal});
  const paragraphButtons:HTMLButtonElement[]=[];
  for(const block of article.blocks){
    const paragraph=document.querySelector<HTMLElement>(`[data-comment-block="${CSS.escape(block.id)}"]`);if(!paragraph)continue;
    const control=button('',()=>open(block.id), 'ac-paragraph-button');control.innerHTML=bubble+'<span></span>';control.dataset.block=block.id;control.dataset.count='0';control.dataset.pagefindIgnore='';control.setAttribute('aria-label','评论这一段');
    paragraph.append(control);paragraphButtons.push(control);
    paragraph.addEventListener('click',e=>{
      if(!matchMedia('(hover: none)').matches || (e.target as Element).closest('a,button,input') || window.getSelection()?.toString())return;
      document.querySelector('.ac-touched')?.classList.remove('ac-touched');paragraph.classList.add('ac-touched');
    },{signal});
  }
  window.addEventListener('focus',()=>{if(!ephemeral){profile=getCommunityProfile();profileName();}},{signal});
  // Counts are fetched once on entry, also supplies the first page for the footer.
  void loadMain();
  teardown=()=>{cancelParagraphHint();controller.abort();quoteObserver.disconnect();unsubscribeEmojis();emojiContents.clear();requestGeneration++;mainGeneration++;if(closingTimer)clearTimeout(closingTimer);if(dialog.open)close(true);paragraphButtons.forEach(b=>b.remove());};
}
