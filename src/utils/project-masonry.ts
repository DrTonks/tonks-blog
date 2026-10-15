import { projectPlacements } from "./project-gallery";

/** Keep DOM/tab order chronological while each visual column packs independently. */
export function projectMasonry(node: HTMLElement, _items: unknown) {
  let frame = 0;
  let destroyed = false;
  let width = -1;
  let cards: HTMLElement[] = [];

  function layout() {
    frame = 0;
    if (destroyed || !node.isConnected) return;
    const items = Array.from(node.children) as HTMLElement[];
    const style = getComputedStyle(node);
    const columns = Math.max(1, parseInt(style.getPropertyValue("--project-columns"), 10) || 1);
    const gap = parseFloat(style.columnGap) || 0;
    // Apply the new column count before measuring: stale explicit columns can
    // create implicit tracks when a breakpoint changes from three columns to one.
    items.forEach((item, index) => {
      const column = String(index % columns + 1);
      if (item.style.gridColumn !== column) item.style.gridColumn = column;
    });
    const placements = projectPlacements(cards.map(card => card.getBoundingClientRect().height), columns, gap);
    node.classList.add("is-masonry");
    placements.forEach((placement, index) => {
      items[index].style.gridRow = `${placement.row} / span ${placement.span}`;
    });
  }

  function schedule() {
    if (!destroyed && !frame) frame = requestAnimationFrame(layout);
  }

  const observer = new ResizeObserver(entries => {
    let changed = false;
    for (const entry of entries) {
      if (entry.target !== node) changed = true;
      else if (entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        changed = true;
      }
    }
    if (changed) schedule();
  });

  function observeCards() {
    cards.forEach(card => observer.unobserve(card));
    cards = Array.from(node.querySelectorAll<HTMLElement>(":scope > .project-item > article"));
    cards.forEach(card => observer.observe(card));
    schedule();
  }

  // Filters replace/reorder children; observe after Svelte has finished the DOM update.
  const mutations = new MutationObserver(observeCards);
  mutations.observe(node, { childList: true });
  observer.observe(node);
  observeCards();

  return {
    update() { schedule(); },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
    },
  };
}
