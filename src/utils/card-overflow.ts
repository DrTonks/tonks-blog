/** On-demand title reveal and native, manually controlled tag scrolling. */
export function attachCardOverflow(list: HTMLElement) {
  const life = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  let title: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let animation: Animation | undefined;
  let frame = 0;
  const closing = new Map<HTMLElement, Animation | undefined>();
  const grid = () => list.classList.contains('grid-mode') && matchMedia('(min-width: 769px)').matches;
  function reset(next: HTMLElement, motion?: Animation) {
    motion?.cancel();
    next.removeAttribute('data-title-reveal');
    next.querySelector<HTMLElement>('.post-card__title-viewport')!.scrollLeft = 0;
  }
  function stop() {
    clearTimeout(timer);
    if (title) reset(title, animation);
    for (const [node, motion] of closing) reset(node, motion);
    closing.clear(); animation = undefined;
    title = undefined;
  }
  function leave() {
    clearTimeout(timer);
    if (!title) return;
    // Freeze at the current reading position until the reveal layer has closed.
    if (reduced.matches) reset(title, animation);
    else { animation?.pause(); closing.set(title, animation); }
    title = undefined; animation = undefined;
  }
  function start(next: HTMLElement) {
    if (title === next) return;
    leave();
    const viewport = next.querySelector<HTMLElement>('.post-card__title-viewport')!;
    if (viewport.scrollWidth <= viewport.clientWidth + 1) return;
    title = next;
    animation = closing.get(next); closing.delete(next);
    // Reduced motion still permits explicit arrow-key/manual scrolling.
    if (reduced.matches) { next.dataset.titleReveal = 'manual'; return; }
    timer = setTimeout(() => {
      if (!next.isConnected) { stop(); return; }
      next.dataset.titleReveal = 'auto';
      if (animation) { animation.play(); return; }
      const text = next.querySelector<HTMLElement>('.post-card__title-text')!;
      const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
      animation = text.animate([{ transform: 'translateX(0)' }, { transform: `translateX(-${distance}px)` }], {
        duration: Math.max(1200, distance / 28 * 1000), easing: 'linear', fill: 'forwards'
      });
    }, 1000);
  }
  function buttons(strip: HTMLElement) {
    const row = strip.querySelector<HTMLElement>('.post-card__tags')!;
    const left = strip.querySelector<HTMLButtonElement>('[data-tag-direction="-1"]')!;
    const right = strip.querySelector<HTMLButtonElement>('[data-tag-direction="1"]')!;
    left.disabled = row.scrollLeft < 1;
    right.disabled = row.scrollWidth - row.clientWidth - row.scrollLeft < 1;
  }
  function measure() {
    frame = 0;
    if (!list.isConnected) return;
    const isGrid = grid();
    const focused = document.activeElement;
    // Read first, then write: no per-card read/write layout loop.
    const rows = [...list.querySelectorAll<HTMLElement>('.post-card__tag-strip')].map(strip => ({
      strip, overflow: isGrid && strip.querySelector<HTMLElement>('.post-card__tags')!.scrollWidth > strip.clientWidth + 1
    }));
    for (const { strip, overflow } of rows) {
      strip.toggleAttribute('data-overflow', overflow);
      strip.querySelectorAll<HTMLButtonElement>('[data-tag-direction]').forEach(button => { button.hidden = !overflow; });
    }
    // Scroll bounds include the reserved button space after the write batch.
    for (const { strip } of rows) buttons(strip);
    if (focused instanceof HTMLButtonElement && focused.matches('[data-tag-direction]') && focused.hidden && list.contains(focused)) {
      focused.closest('.post-card')?.querySelector<HTMLElement>('.post-card__title')?.focus({ preventScroll: true });
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
  const observer = new ResizeObserver(() => { stop(); schedule(); });
  observer.observe(list);
  function sync() { stop(); schedule(); }
  document.addEventListener('tonks:post-list-updated', sync, { signal: life.signal });
  window.addEventListener('layoutInit', sync, { signal: life.signal });
  document.fonts.ready.then(() => { if (!life.signal.aborted) schedule(); });
  reduced.addEventListener('change', stop, { signal: life.signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal: life.signal });
  // CSS owns the complementary masks; only reset scrolling once hidden.
  list.addEventListener('transitionend', event => {
    if (event.propertyName !== 'clip-path') return;
    const layer = event.target;
    if (!(layer instanceof HTMLElement) || !layer.matches('.post-card__title-reveal')) return;
    const target = layer.closest<HTMLElement>('.post-card__title')!;
    if (!closing.has(target) || target.closest('.post-card')?.matches(':hover, :focus-within')) return;
    reset(target, closing.get(target)); closing.delete(target);
  }, { signal: life.signal });
  list.addEventListener('pointerover', event => {
    if (!pointer.matches || event.pointerType === 'touch') return;
    const next = (event.target as Element).closest('.post-card')?.querySelector<HTMLElement>('.post-card__title');
    if (next) start(next);
  }, { signal: life.signal });
  list.addEventListener('pointerout', event => {
    const card = title?.closest('.post-card');
    if (card?.contains(event.target as Node) && !card.contains(event.relatedTarget as Node | null) && !card.contains(document.activeElement)) leave();
  }, { signal: life.signal });
  list.addEventListener('focusin', event => {
    const next = (event.target as Element).closest('.post-card')?.querySelector<HTMLElement>('.post-card__title');
    if (next) start(next);
  }, { signal: life.signal });
  list.addEventListener('focusout', event => {
    const card = title?.closest('.post-card');
    if (card && !card.contains(event.relatedTarget as Node | null) && !card.matches(':hover')) leave();
  }, { signal: life.signal });
  list.addEventListener('keydown', event => {
    const current = (event.target as Element).closest<HTMLElement>('.post-card__title');
    if (!current || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (title !== current) { stop(); title = current; }
    event.preventDefault(); clearTimeout(timer); animation?.cancel(); animation = undefined;
    title.dataset.titleReveal = 'manual';
    title.querySelector<HTMLElement>('.post-card__title-viewport')!.scrollBy({ left: event.key === 'ArrowRight' ? 80 : -80, behavior: 'instant' });
  }, { signal: life.signal });
  list.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-tag-direction]');
    if (!button) return;
    const row = button.closest('.post-card__tag-strip')!.querySelector<HTMLElement>('.post-card__tags')!;
    row.scrollBy({ left: Number(button.dataset.tagDirection) * row.clientWidth * .75, behavior: reduced.matches ? 'instant' : 'smooth' });
  }, { signal: life.signal });
  list.addEventListener('scroll', event => {
    if ((event.target as Element).matches('.post-card__tags')) buttons((event.target as Element).parentElement!);
  }, { capture: true, passive: true, signal: life.signal });
  schedule();
  return () => {
    stop(); life.abort(); observer.disconnect(); cancelAnimationFrame(frame);
  };
}
