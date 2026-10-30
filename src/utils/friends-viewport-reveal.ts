import { attachViewportReveal } from './viewport-reveal';

let installed = false;

/** Animate the link wrapper; the inner paper keeps its rotation and hover. */
export function installFriendsViewportReveal() {
  if (installed) return;
  installed = true;
  let navigating = false;
  let hooked = false;
  let root: HTMLElement | null = null;
  let controller: ReturnType<typeof attachViewportReveal> | undefined;
  const init = () => {
    const next = document.querySelector<HTMLElement>('[data-friends-reveal-root]');
    if (next === root) return;
    controller?.destroy();
    root = next;
    controller = root ? attachViewportReveal(root, {
      selector: '[data-friend-reveal]',
      key: element => `friend:${element.getAttribute('href')}`,
      stateAttribute: 'data-friend-reveal-state',
    }, navigating) : undefined;
  };
  const register = () => {
    const swup = window.swup;
    if (hooked || !swup?.hooks) return;
    hooked = true;
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
