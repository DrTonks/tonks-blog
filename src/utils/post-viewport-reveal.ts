import { attachViewportReveal } from './viewport-reveal';

/** Homepage-only adapter; the post-list controller owns its lifecycle. */
export function attachPostViewportReveal(list: HTMLElement, initiallySuspended = false) {
  return attachViewportReveal(list, {
    selector: '.post-card',
    key: card => `post:${card.querySelector<HTMLAnchorElement>('.post-card__title')!.pathname}`,
    stateAttribute: 'data-post-reveal',
  }, initiallySuspended);
}
