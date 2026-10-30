import { attachViewportReveal } from './viewport-reveal';

let installed = false;

/** Installed from the persistent layout so both direct and Swup visits work. */
export function installAboutViewportReveal() {
  if (installed) return;
  installed = true;
  let navigating = false;
  let hooked = false;
  let root: HTMLElement | null = null;
  let controller: ReturnType<typeof attachViewportReveal> | undefined;
  const init = () => {
    const next = document.querySelector<HTMLElement>('[data-about-reveal-root]');
    if (next === root) return;
    controller?.destroy();
    root = next;
    const path = location.pathname;
    controller = root ? attachViewportReveal(root, {
      selector: '[data-about-reveal]',
      key: element => `about:${path}:${element.dataset.aboutReveal}`,
      stateAttribute: 'data-about-reveal-state',
    }, navigating) : undefined;
  };
  const register = () => {
    const swup = window.swup;
    if (hooked || !swup?.hooks) return;
    hooked = true;
    // Swup updates same-page hashes via pushState, without a hashchange event.
    swup.hooks.before('link:anchor', (_visit, { hash }) => controller?.revealHash(hash));
    swup.hooks.before('visit:start', () => { navigating = true; controller?.suspend(); });
    swup.hooks.on('content:replace', init, { priority: -200 });
    swup.hooks.on('visit:end', () => { navigating = false; controller?.resume(); });
    swup.hooks.on('visit:abort', () => { navigating = false; controller?.resume(); });
  };
  document.addEventListener('astro:page-load', init);
  document.addEventListener('swup:enable', register, { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  register();
}
