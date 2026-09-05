type Version = { id: string; builtAt: string };
type Visit = { from: { url: string; hash?: string }; to: { url: string; hash?: string; document?: Document }; abort(): void };
type UpdateSwup = {
  cache: { clear(): void };
  destroy(): void;
  hooks: {
    before(event: string, handler: (visit: Visit) => unknown, options?: { priority: number }): void;
    on(event: string, handler: () => void): void;
  };
};
const VERSION_PARAM = '__build';
const POSITION_KEY = 'tonks:update-position';
const canonical = (input: string) => {
  const url = new URL(input, location.href);
  url.searchParams.delete(VERSION_PARAM);
  return url.pathname + url.search + url.hash;
};

export function initializeBuildUpdates(current: string) {
  const notice = document.getElementById('build-update-notice');
  if (!notice || notice.dataset.ready || !current) return;
  notice.dataset.ready = 'true';
  // Track interaction before load too: slow images must not pull a reader back
  // after they have already chosen a different position in the new document.
  const restoreController = new AbortController();
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(event, () => restoreController.abort(), { once: true, passive: true, signal: restoreController.signal });
  const description = notice.querySelector<HTMLElement>('[data-update-description]')!;
  let latest: Version | undefined;
  let dismissed = '';
  let dirty = false;
  let checking = false;
  let lastCheck = 0;
  let navigating = false;
  let startedAt = { url: location.href, body: document.body.className };
  const swup = () => window.swup as unknown as UpdateSwup | undefined;
  const show = () => { notice.hidden = false; };
  const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest('form, textarea, [contenteditable="true"]')) return;
    dirty = true;
    window.addEventListener('beforeunload', beforeUnload);
  }, { capture: true });

  // This only bypasses the document cache. Fingerprinted assets keep their cache.
  const loadVersion = (destination: string, preservePosition: boolean, replace: boolean) => {
    if (!latest || navigating) return;
    const target = new URL(destination, location.href);
    if (target.origin !== location.origin) return;
    if (preservePosition) {
      try { sessionStorage.setItem(POSITION_KEY, JSON.stringify({ id: latest.id, url: canonical(destination), y: scrollY, expires: Date.now() + 120000 })); } catch { /* Storage is optional. */ }
    }
    target.searchParams.set(VERSION_PARAM, latest.id);
    swup()?.cache.clear();
    navigating = true;
    if (replace) location.replace(target.href);
    else location.assign(target.href);
  };
  notice.querySelector('[data-update-now]')?.addEventListener('click', () => {
    if (dirty && !window.confirm('页面上有尚未提交的输入。现在更新可能丢失这些内容，仍要继续吗？')) return;
    dirty = false;
    loadVersion(location.href, true, true);
  });
  notice.querySelector('[data-update-later]')?.addEventListener('click', () => {
    dismissed = latest?.id || '';
    notice.hidden = true;
  });

  const check = async () => {
    if (checking || document.hidden || !navigator.onLine || Date.now() - lastCheck < 60000) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const url = new URL(`${import.meta.env.BASE_URL}version.json`, location.origin);
      url.searchParams.set('_', String(Date.now()));
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!response.ok) return;
      const version = await response.json() as Version;
      if (typeof version.id !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(version.id) || typeof version.builtAt !== 'string') return;
      if (version.id === current) { latest = undefined; notice.hidden = true; return; }
      latest = version;
      swup()?.cache.clear();
      if (dismissed !== version.id) show();
    } catch { /* Offline and incomplete deploys leave the current page usable. */ }
    finally { checking = false; }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  window.addEventListener('online', () => { lastCheck = 0; void check(); });
  window.addEventListener('pageshow', () => { void check(); });
  window.setInterval(() => { void check(); }, 180000);
  void check();

  // Once an update is known, subsequent navigation must leave the old JS runtime.
  document.addEventListener('click', (event) => {
    if (!latest || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const target = new URL(link.href, location.href);
    if (target.origin !== location.origin || !/^https?:$/.test(target.protocol)) return;
    if (target.pathname === location.pathname && target.search === location.search && target.hash) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (dirty) {
      description.textContent = '页面上还有未提交的输入。请先完成或保存，再点击“立即更新”。';
      show();
      return;
    }
    loadVersion(target.href, false, false);
  }, { capture: true });

  const register = () => {
    const runtime = swup();
    if (!runtime) return;
    runtime.hooks.on('page:view', () => {
      dirty = false;
      window.removeEventListener('beforeunload', beforeUnload);
    });
    runtime.hooks.before('visit:start', (visit) => { startedAt = { url: visit.from.url + (visit.from.hash || ''), body: document.body.className }; });
    runtime.hooks.before('content:replace', (visit) => {
      const incoming = visit.to.document?.querySelector<HTMLMetaElement>('meta[name="tonks-build"]')?.content;
      if (!incoming || incoming === current) return;
      // Prevent new HTML/CSS entering an old persistent sidebar/runtime even
      // when a release lands between polling checks or a history traversal.
      latest = { id: incoming, builtAt: '' };
      const destination = visit.to.url + (visit.to.hash || '');
      visit.abort();
      runtime.cache.clear();
      runtime.destroy();
      document.documentElement.classList.remove('is-changing', 'is-animating', 'is-leaving', 'is-rendering', 'is-popstate');
      document.body.className = startedAt.body;
      document.querySelector('#sidebar-primary-widget')?.removeAttribute('data-navigation-out');
      document.getElementById('toc-wrapper')?.classList.remove('toc-not-ready');
      const summary = document.querySelector('[data-summary-typed]');
      if (summary) summary.textContent = document.getElementById('sidebar-primary-widget')?.dataset.summary || '';
      window.__tonksBannerPageTransitionPaused = false;
      window.__tonksBannerCarouselRuntime?.setPageTransitionPaused(false);
      window.scrollProtectionManager?.setPageTransitioning(false);
      if (dirty) {
        history.replaceState(history.state, '', startedAt.url);
        description.textContent = '网站已更新。请先保存未提交的输入，再更新到最新版本。';
        show();
      } else loadVersion(destination, false, true);
      // Swup treats an undefined rejection as an aborted visit, not an error.
      return Promise.reject(undefined);
    }, { priority: -10000 });
  };
  if (swup()) register();
  else document.addEventListener('swup:enable', register, { once: true });

  const restore = () => {
    let saved: { id: string; url: string; y: number; expires: number } | undefined;
    try {
      const raw = sessionStorage.getItem(POSITION_KEY);
      sessionStorage.removeItem(POSITION_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch { /* No usable position record. */ }
    if (new URL(location.href).searchParams.has(VERSION_PARAM)) history.replaceState(history.state, '', canonical(location.href));
    if (!saved || saved.id !== current || saved.url !== canonical(location.href) || saved.expires < Date.now() || !Number.isFinite(saved.y)) { restoreController.abort(); return; }
    const deadline = performance.now() + 2500;
    const position = Math.max(0, saved.y);
    const settle = () => {
      if (restoreController.signal.aborted) return;
      if (document.documentElement.scrollHeight - innerHeight >= position || performance.now() >= deadline) {
        window.scrollTo({ top: position, behavior: 'instant' });
        restoreController.abort();
      } else requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  };
  if (document.readyState === 'complete') restore();
  else window.addEventListener('load', restore, { once: true });
}
