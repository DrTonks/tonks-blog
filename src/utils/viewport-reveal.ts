// Session-local: Swup returns do not replay content already seen.
const seen = new Set<string>();

interface RevealOptions {
  selector: string;
  key: (element: HTMLElement) => string;
  stateAttribute: string;
}

/** Progressive enhancement: content and layout always remain in the DOM. */
export function attachViewportReveal(list: HTMLElement, options: RevealOptions, initiallySuspended = false) {
  const life = new AbortController();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pending = new Set<HTMLElement>();
  const motions = new Map<HTMLElement, Animation>();
  let suspended = initiallySuspended;
  let printing = false;
  let frame = 0;
  let bannerWait: MutationObserver | undefined;
  const key = options.key;
  const elements = () => [...list.querySelectorAll<HTMLElement>(options.selector)];
  function show(card: HTMLElement, animate = false, delay = 0) {
    observer?.unobserve(card); pending.delete(card);
    card.removeAttribute(options.stateAttribute);
    motions.get(card)?.cancel(); motions.delete(card);
    seen.add(key(card));
    if (!animate || reduced.matches || !card.isConnected) return;
    const motion = card.animate([
      { opacity: 0, transform: 'translateY(14px)', offset: 0 },
      { opacity: 1, transform: 'translateY(-1px)', offset: .8 },
      { opacity: 1, transform: 'translateY(0)', offset: 1 },
    ], { duration: 500, delay, easing: 'cubic-bezier(.25, .1, .25, 1)', fill: 'both' });
    motions.set(card, motion);
    motion.finished.then(() => {
      if (motions.get(card) === motion) { motion.cancel(); motions.delete(card); }
    }).catch(() => {});
  }
  const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
    if (suspended) return;
    let order = 0;
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      if (!entry.isIntersecting || !pending.has(card)) continue;
      // Fast scrolling must not leave a queue of delayed cards behind it.
      const animate = entry.boundingClientRect.top >= -24 && !document.hidden;
      show(card, animate, Math.min(order++ * 50, 100));
    }
  // isIntersecting can become true before a non-zero ratio threshold is met.
  // Shrink the bottom edge instead: reveal after ~20px enters the viewport.
  }, { rootMargin: '0px 0px -20px 0px', threshold: 0 });

  function clear() {
    cancelAnimationFrame(frame); frame = 0;
    bannerWait?.disconnect(); bannerWait = undefined;
    observer?.disconnect();
    for (const card of pending) card.removeAttribute(options.stateAttribute);
    pending.clear();
    for (const motion of motions.values()) motion.cancel();
    motions.clear();
  }
  function hashTarget(hash = location.hash) {
    try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
    catch { return null; }
  }
  function includesTarget(element: HTMLElement, target: Element | null) {
    return !!target && (element.contains(target) || target.contains(element));
  }
  function revealHash(hash = location.hash) {
    const target = hashTarget(hash);
    for (const card of elements()) if (includesTarget(card, target)) show(card);
  }
  function refresh() {
    if (suspended || frame || life.signal.aborted || document.hidden || printing) return;
    // visit:end may precede the banner's final frame. Observe its lifecycle
    // attribute instead of polling geometry while parent elements are moving.
    if (document.body.hasAttribute('data-banner-navigation')) {
      if (!bannerWait) {
        bannerWait = new MutationObserver(() => {
          if (!document.body.hasAttribute('data-banner-navigation')) {
            bannerWait?.disconnect(); bannerWait = undefined; refresh();
          }
        });
        bannerWait.observe(document.body, { attributes: true, attributeFilter: ['data-banner-navigation'] });
      }
      return;
    }
    frame = requestAnimationFrame(() => {
      clear();
      if (!list.isConnected || reduced.matches || !observer) return;
      if (document.body.hasAttribute('data-banner-navigation')) { refresh(); return; }
      const anchor = hashTarget();
      const focused = document.activeElement;
      // One read batch; no scroll listener or per-frame visibility scans.
      const cards = elements().map(card => ({ card, top: card.getBoundingClientRect().top }));
      for (const { card, top } of cards) {
        if (seen.has(key(card)) || top < innerHeight || includesTarget(card, anchor) || card.contains(focused)) {
          seen.add(key(card)); continue;
        }
        card.classList.remove('onload-animation');
        card.setAttribute(options.stateAttribute, 'pending'); pending.add(card); observer.observe(card);
      }
    });
  }
  list.addEventListener('focusin', event => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>(options.selector);
    if (card && list.contains(card)) show(card);
  }, { signal: life.signal });
  window.addEventListener('hashchange', () => revealHash(), { signal: life.signal });
  reduced.addEventListener('change', () => { clear(); refresh(); }, { signal: life.signal });
  window.addEventListener('beforeprint', () => { printing = true; clear(); }, { signal: life.signal });
  window.addEventListener('afterprint', () => { printing = false; refresh(); }, { signal: life.signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear(); else refresh();
  }, { signal: life.signal });
  refresh();
  return {
    refresh,
    revealHash,
    suspend() { suspended = true; clear(); },
    resume() { suspended = false; refresh(); },
    destroy() { suspended = true; clear(); life.abort(); },
  };
}
