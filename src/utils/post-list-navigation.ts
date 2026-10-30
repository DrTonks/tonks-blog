import { pageForIndex, pageIndices, pageSizeForLayout, paginationNumbers } from './post-pagination';
import { url } from './url-utils';
import { attachCardOverflow } from './card-overflow';
import { attachPostViewportReveal } from './post-viewport-reveal';

let installed = false;
let hooked = false;
let navigating = false;
let controller: ReturnType<typeof mount> | undefined;
const address = (page: number, size: number) => `${url(page === 1 ? '/' : `/${page}/`)}?size=${size}`;

function mount(root: HTMLElement, cachedWidth?: number) {
  const list = root.querySelector<HTMLElement>('#post-list-container')!;
  const nav = document.querySelector<HTMLElement>('[data-post-pagination]')!;
  const pool = root.querySelector<HTMLTemplateElement>('[data-post-pool]')!;
  const template = nav.cloneNode(true) as HTMLElement;
  const separator = list.querySelector('[data-post-separator]')?.cloneNode(true);
  const cards = new Map<number, HTMLElement>();
  for (const parent of [list, pool.content]) parent.querySelectorAll<HTMLElement>('[data-post-index]').forEach(card => {
    card.id = `post-list-item-${card.dataset.postIndex}`;
    cards.set(Number(card.dataset.postIndex), card);
  });
  const total = Number(root.dataset.total);
  const routePage = Number(root.dataset.staticPage);
  const lifetime = new AbortController();
  let suspended = navigating;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let currentSize = 8;
  let currentPage = routePage;
  let mode = list.dataset.defaultLayout || 'list';
  try { mode = localStorage.getItem('postListLayout') || mode; } catch { /* Use site default. */ }
  function state(knownWidth?: number) {
    const grid = mode === 'grid' && matchMedia('(min-width: 769px)').matches;
    const width = knownWidth ?? root.getBoundingClientRect().width;
    const size = pageSizeForLayout(grid, width);
    return { grid, size, width, columns: size === 12 ? '3' : '2' };
  }
  function anchor() {
    const visible = [...list.querySelectorAll<HTMLElement>('[data-post-index]')];
    const card = visible.find(card => card.getBoundingClientRect().bottom > 100) || visible[0];
    return card && { index: Number(card.dataset.postIndex), top: card.getBoundingClientRect().top, preserve: list.getBoundingClientRect().top < 100 };
  }
  let reading: ReturnType<typeof anchor>;
  let resizing = false;
  let resizeInterrupted = false;
  let readingFrame = 0;
  // A CSS breakpoint may hide the focused category before the debounced
  // resize handler runs, at which point activeElement has already become body.
  let categoryFocus: HTMLElement | undefined;
  document.addEventListener('focusin', event => {
    const target = event.target;
    categoryFocus = target instanceof HTMLElement && list.contains(target)
      ? target.closest<HTMLElement>('.category-badge') ?? undefined : undefined;
  }, { signal: lifetime.signal });
  let layoutAnimations: Animation[] = [];
  let layoutVersion = 0;
  let layoutBusy = false;
  let layoutInterrupted = false;
  let layoutStartOpacity = 1;
  let viewportReveal: ReturnType<typeof attachPostViewportReveal> | undefined;
  function cancelLayoutTransition() {
    layoutVersion++;
    layoutAnimations.forEach(animation => animation.cancel());
    layoutAnimations = [];
    layoutBusy = false;
    root.removeAttribute('aria-busy');
  }
  async function transitionLayout(enterOnly = false) {
    viewportReveal?.suspend();
    const version = layoutVersion;
    layoutBusy = true; layoutInterrupted = false;
    root.setAttribute('aria-busy', 'true');
    const targets = [root, nav];
    const startOpacity = layoutStartOpacity;
    layoutStartOpacity = 1;
    if (!enterOnly) {
      layoutAnimations = targets.map(target => target.animate([{ opacity: startOpacity }, { opacity: 0 }], {
        duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both'
      }));
      await Promise.all(layoutAnimations.map(animation => animation.finished)).catch(() => {});
      if (version !== layoutVersion) return;
      // Width and reading position may have changed during the exit animation.
      // Recompute while hidden instead of entering with a stale card set.
      layoutBusy = false;
      if (layoutInterrupted) resizeInterrupted = true;
      update();
      if (version !== layoutVersion || suspended || navigating) return;
      layoutBusy = true;
    }
    layoutAnimations.forEach(animation => animation.cancel());
    layoutAnimations = targets.map(target => target.animate([{ opacity: enterOnly ? startOpacity : 0 }, { opacity: 1 }], {
      duration: 400, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both'
    }));
    await Promise.all(layoutAnimations.map(animation => animation.finished)).catch(() => {});
    if (version !== layoutVersion) return;
    cancelLayoutTransition();
    if (dirty) update();
    if (!suspended && !navigating && !layoutBusy) viewportReveal?.resume();
  }
  function pagination() {
    const last = Math.max(1, Math.ceil(total / currentSize));
    const group = template.querySelector('.pagination-industrial__pages')!.cloneNode(false) as HTMLElement;
    const active = template.querySelector<HTMLElement>('[aria-current="page"]')!;
    const inactive = template.querySelector<HTMLAnchorElement>('.pagination-industrial__pages a');
    function linkTo(link: HTMLAnchorElement, page: number, label: string, disabled = false) {
      link.setAttribute('aria-label', label); link.classList.toggle('disabled', disabled);
      if (disabled) { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.tabIndex = -1; }
      else { link.href = address(page, currentSize); link.removeAttribute('aria-disabled'); link.removeAttribute('tabindex'); }
    }
    const prev = template.querySelector<HTMLAnchorElement>('.is-prev')!.cloneNode(true) as HTMLAnchorElement;
    const next = template.querySelector<HTMLAnchorElement>('.is-next')!.cloneNode(true) as HTMLAnchorElement;
    linkTo(prev, currentPage - 1, '上一页', currentPage === 1); linkTo(next, currentPage + 1, '下一页', currentPage === last);
    for (const page of paginationNumbers(currentPage, last)) {
      if (page === -1) { const dots = document.createElement('span'); dots.textContent = '…'; dots.className = 'mx-1'; dots.setAttribute('aria-hidden', 'true'); group.append(dots); continue; }
      let el: HTMLElement;
      if (page === currentPage) el = active.cloneNode(false) as HTMLElement;
      else {
        const link = inactive ? inactive.cloneNode(false) as HTMLAnchorElement : document.createElement('a');
        if (!inactive) {
          for (const attr of active.attributes) if (attr.name.startsWith('data-astro-')) link.setAttribute(attr.name, attr.value);
          link.className = 'signal-control signal-sweep signal-marker btn-card w-11 h-11 rounded-lg overflow-hidden active:scale-[0.85]';
        }
        linkTo(link, page, `第 ${page} 页`); el = link;
      }
      const label = document.createElement('span'); label.className = 'relative z-10'; label.textContent = String(page); el.append(label); group.append(el);
    }
    nav.replaceChildren(prev, group, next); nav.setAttribute('aria-label', `文章分页，每页 ${currentSize} 篇`);
  }
  function apply(page: number, size: number, grid: boolean, columns: string, initial: boolean) {
    const indices = pageIndices(page, size, total);
    if (indices.some(index => !cards.has(index))) throw new Error('Static post pool is incomplete');
    const changed = indices.join(',') !== [...list.querySelectorAll<HTMLElement>('[data-post-index]')].map(card => card.dataset.postIndex).join(',');
    const focused = document.activeElement;
    const focusedCategory = focused instanceof HTMLElement && list.contains(focused) ? focused.closest('.category-badge')
      : focused === document.body && categoryFocus && list.contains(categoryFocus) && !categoryFocus.getClientRects().length ? categoryFocus : null;
    list.querySelectorAll('[data-post-separator]').forEach(node => node.remove());
    for (const card of list.querySelectorAll<HTMLElement>('[data-post-index]')) if (!indices.includes(Number(card.dataset.postIndex))) pool.content.append(card);
    indices.forEach((index, position) => {
      const card = cards.get(index)!;
      if (!initial) card.classList.remove('onload-animation');
      else card.style.animationDelay = `calc(var(--content-delay) + ${position * 50}ms)`;
      if (list.children[position] !== card) list.insertBefore(card, list.children[position] || null);
    });
    if (separator) for (const card of list.querySelectorAll('[data-post-index]')) card.after(separator.cloneNode(true));
    list.classList.toggle('grid-mode', grid); list.classList.toggle('list-mode', !grid);
    list.dataset.columns = columns; list.classList.add('js-initialized');
    currentPage = page; currentSize = size; root.dataset.pageSize = String(size); root.dataset.ready = 'true';
    pagination();
    if (!initial) root.querySelector('[data-post-list-announcement]')!.textContent = `第 ${page} 页，共 ${Math.max(1, Math.ceil(total / size))} 页，本页 ${indices.length} 篇文章`;
    if (initial) nav.style.animationDelay = `calc(var(--content-delay) + ${indices.length * 50}ms)`;
    if (changed) document.dispatchEvent(new Event('tonks:post-list-updated'));
    if (!initial && ((focused instanceof HTMLElement && !focused.isConnected) || (focusedCategory && !focusedCategory.isConnected))) list.focus({ preventScroll: true });
    else if (!initial && focusedCategory) {
      const replacement = focusedCategory.closest('.post-card')?.querySelector<HTMLElement>(grid ? '.post-card__category-bottom' : '.post-card__category-inline .category-badge, .category-badge.post-card__category-inline');
      if (replacement && replacement !== focusedCategory) replacement.focus({ preventScroll: true });
    }
    window.dispatchEvent(new CustomEvent('layoutInit', { detail: { layout: grid ? 'grid' : 'list' } }));
    viewportReveal?.refresh();
  }
  function update(animate = false) {
    if (!root.isConnected) return;
    if (suspended || navigating || layoutBusy) { dirty = true; return; }
    dirty = false;
    const { grid, size, columns } = state();
    const saved = resizing && !resizeInterrupted ? reading : anchor();
    const interrupted = resizeInterrupted;
    const preserve = !resizeInterrupted && saved?.preserve;
    resizing = false; resizeInterrupted = false;
    const page = pageForIndex(saved?.index ?? (currentPage - 1) * currentSize, size, total);
    if (size !== currentSize && page !== currentPage) {
      // A different logical page uses Swup's single animation/scroll/history
      // owner, including homepage banner state and user scroll cancellation.
      const target = address(page, size);
      if (window.swup) window.swup.navigate(target, { history: 'replace', meta: { postListAnchor: preserve ? saved!.index : undefined, postListTop: preserve ? saved!.top : undefined, postListKeepScroll: interrupted } });
      else location.replace(target + (preserve ? `#post-list-item-${saved!.index}` : ''));
      return;
    }
    if (size === currentSize && list.classList.contains('grid-mode') === grid && list.dataset.columns === columns) {
      reading = anchor();
      if (animate && layoutStartOpacity < 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) void transitionLayout(true);
      else layoutStartOpacity = 1;
      return;
    }
    const commit = () => {
      apply(page, size, grid, columns, false);
      const href = address(page, size) + location.hash;
      history.replaceState({ ...history.state, url: href }, '', href);
      if (window.swup?.location) window.swup.location.href = location.href;
      if (preserve && (!layoutBusy || !layoutInterrupted)) window.scrollBy({ top: cards.get(saved!.index)!.getBoundingClientRect().top - saved!.top, behavior: 'instant' });
      reading = anchor();
    };
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) void transitionLayout();
    else commit();
  }
  const initial = state(cachedWidth);
  const querySize = Number(new URLSearchParams(location.search).get('size'));
  const size = querySize === 8 || querySize === 12 ? querySize : routePage === 1 ? initial.size : 8;
  const page = Math.min(routePage, Math.max(1, Math.ceil(total / size)));
  list.tabIndex = -1; apply(page, size, initial.grid, initial.columns, true);
  const destroyOverflow = attachCardOverflow(list);
  if (routePage === 1) viewportReveal = attachPostViewportReveal(list, suspended);
  let observedWidth = initial.width;
  let observedViewport = innerWidth;
  // Read only after this frame's writes have been committed. During a visit,
  // resume() captures the final restored position instead of forcing layout.
  readingFrame = requestAnimationFrame(() => {
    readingFrame = 0;
    if (!suspended) reading = anchor();
  });
  const observer = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect.width;
    if (width === undefined || (Math.abs(width - observedWidth) < .5 && pageSizeForLayout(true, width) === pageSizeForLayout(true, observedWidth))) return;
    observedWidth = width;
    observedViewport = innerWidth;
    resizing = true;
    clearTimeout(timer);
    // Commit columns and card count together; CSS never races this update.
    timer = setTimeout(update, 140);
  });
  observer.observe(root);
  window.addEventListener('scroll', () => {
    if (readingFrame || suspended || resizing) return;
    readingFrame = requestAnimationFrame(() => {
      readingFrame = 0;
      if (!suspended && !resizing && Math.abs(root.getBoundingClientRect().width - observedWidth) < .5) reading = anchor();
    });
  }, { passive: true, signal: lifetime.signal });
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(type, () => {
    if (type === 'pointerdown' || type === 'touchstart') categoryFocus = undefined;
    if (resizing) resizeInterrupted = true;
    if (layoutBusy) layoutInterrupted = true;
  }, { passive: true, signal: lifetime.signal });
  window.addEventListener('layoutChange', event => {
    if (!(event instanceof CustomEvent)) return;
    layoutStartOpacity = Number(getComputedStyle(root).opacity);
    cancelLayoutTransition();
    mode = event.detail?.layout === 'grid' ? 'grid' : 'list'; update(true);
    if (!suspended && !navigating && !layoutBusy) viewportReveal?.resume();
  }, { signal: lifetime.signal });
  return {
    root,
    // List-to-list visits share the same shell. Reuse its observed width to
    // avoid forcing an extra style/layout pass halfway through DOM replacement.
    width() { return observedViewport === innerWidth ? observedWidth : undefined; },
    suspend() {
      viewportReveal?.suspend();
      suspended = true; clearTimeout(timer);
      // Preserve the current opacity while Swup fades its parent out.
      if (layoutAnimations.length) for (const target of [root, nav]) target.style.opacity = getComputedStyle(target).opacity;
      cancelLayoutTransition();
    },
    resume(allowUpdate = true) {
      suspended = false;
      const opacity = Number(root.style.opacity || 1);
      for (const target of [root, nav]) target.style.removeProperty('opacity');
      if (dirty && allowUpdate) update(); else reading = anchor();
      if (opacity < 1 && !navigating && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        layoutStartOpacity = opacity; void transitionLayout(true);
      }
      if (!navigating && !layoutBusy) viewportReveal?.resume();
    },
    destroy() { viewportReveal?.destroy(); cancelLayoutTransition(); for (const target of [root, nav]) target.style.removeProperty('opacity'); destroyOverflow(); lifetime.abort(); observer.disconnect(); clearTimeout(timer); cancelAnimationFrame(readingFrame); }
  };
}

export function installPostList() {
  if (installed) return;
  installed = true;
  const init = () => {
    const root = document.querySelector<HTMLElement>('[data-post-list-root]');
    if (root === controller?.root) return;
    if (root) {
      const params = new URLSearchParams(location.search);
      const size = Number(params.get('size'));
      if (size === 8 || size === 12) {
        const legacy = Number(params.get('page'));
        const requested = Number.isSafeInteger(legacy) && legacy > 0 ? legacy : Number(root.dataset.staticPage);
        const page = Math.min(requested, Math.max(1, Math.ceil(Number(root.dataset.total) / size)));
        const expected = url(page === 1 ? '/' : `/${page}/`);
        // Compatibility for unpublished query-only URLs and out-of-range
        // shares. Never silently show a different page under the old address.
        if (params.has('page') || expected !== location.pathname) {
          location.replace(address(page, size) + location.hash); return;
        }
      }
    }
    const width = controller?.width();
    controller?.destroy(); controller = root ? mount(root, width) : undefined;
  };
  const register = () => {
    const swup = window.swup;
    if (hooked || !swup?.hooks) return;
    hooked = true;
    swup.hooks.before('visit:start', visit => {
      navigating = true;
      const index = visit.meta.postListAnchor;
      if (visit.meta.postListKeepScroll) visit.scroll.reset = false;
      if (typeof index === 'number') visit.scroll.target = `#post-list-item-${index}`;
      controller?.suspend();
    });
    // Live DOM is ready before sidebar sizing, scrolling and entrance. Swup's
    // cached source HTML is never modified to fit a particular viewport.
    swup.hooks.on('content:replace', init, { priority: -200 });
    swup.hooks.on('visit:end', () => { navigating = false; controller?.resume(); });
    // Swup has not finished aborting the old visit yet. Do not navigate again
    // from this hook; the winning visit will consume pending resize work.
    swup.hooks.on('visit:abort', () => { navigating = false; controller?.resume(false); });
  };
  document.addEventListener('astro:page-load', init);
  document.addEventListener('swup:enable', register, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  register();
}
