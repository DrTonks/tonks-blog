/** Preserve persistent sidebar geometry across content replacement, without a frame loop. */
export function createSidebarLayoutTransition() {
	let positions: Array<{element: HTMLElement; top: number}> | undefined;
	let depth = 0;
	const animations = new Map<HTMLElement, Animation>();
	const layoutTop = (element: HTMLElement, grid: HTMLElement) => {
		let visualOffset = 0;
		for (let node: HTMLElement | null = element; node && node !== grid; node = node.parentElement) {
			const style = getComputedStyle(node);
			visualOffset += new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform).m42;
			visualOffset += parseFloat(style.translate.split(' ')[1] ?? '0') || 0;
		}
		return element.getBoundingClientRect().top - grid.getBoundingClientRect().top - visualOffset;
	};
	const elements = () => Array.from(document.querySelectorAll<HTMLElement>(
		'#sidebar, #sidebar-sticky, #sidebar [data-sidebar-motion-item], #sidebar .sidebar-inline-toc',
	));
	return {
		capture() {
			depth++;
			// The outer replacement snapshot must survive nested sidebar updates.
			if (positions) return;
			const grid = document.getElementById('main-grid');
			if (!grid) return;
			positions = elements().filter(element => element.getClientRects().length > 0)
				.map(element => ({element, top: layoutTop(element, grid)}));
		},
		restore() {
			if (depth === 0 || --depth > 0) return;
			const previous = positions;
			positions = undefined;
			if (!previous || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			const grid = document.getElementById('main-grid');
			if (!grid) return;
			// Apply parents first and subtract their correction from child deltas.
			const corrections = new Map<HTMLElement, number>();
			for (const {element, top} of previous) {
				if (!element.isConnected || !element.getClientRects().length) continue;
				let inherited = 0;
				for (let node = element.parentElement; node && node !== grid; node = node.parentElement) {
					inherited += corrections.get(node) ?? 0;
				}
				const delta = top - layoutTop(element, grid) - inherited;
				if (Math.abs(delta) < .5) continue;
				corrections.set(element, delta);
				const translate = getComputedStyle(element).translate.split(' ');
				const current = parseFloat(translate[1] ?? '0') || 0;
				animations.get(element)?.cancel();
				// translate composes with the existing banner/sticky transform animation.
				const effect = element.animate([{translate: `0px ${current + delta}px`}, {translate: '0px 0px'}], {
					duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both',
				});
				animations.set(element, effect);
				void effect.finished.then(() => {
					if (animations.get(element) !== effect) return;
					effect.cancel(); animations.delete(element);
				}).catch(() => {});
			}
		},
		clear() {
			depth = 0;
			positions = undefined;
			for (const effect of animations.values()) effect.cancel();
			animations.clear();
		},
	};
}
