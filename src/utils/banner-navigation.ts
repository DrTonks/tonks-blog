/** Keep the banner's layout motion and window scrolling on one timeline. */
export function createBannerNavigation(onFinish: () => void) {
	const properties = [
		['banner-wrapper', 'transform'],
		['home-sticker-motion', 'transform'],
		['banner', 'transform'],
		['main-grid', 'transform'],
		['sidebar-sticky', 'top'],
	] as const;
	let effects: Animation[] = [];
	let destinations: Array<{ element: HTMLElement; property: 'transform' | 'top'; from: string; to: string }> = [];
	let transitions: Array<{ element: HTMLElement; value: string; priority: string }> = [];
	let frame = 0;
	let scrollEnd: (() => void) | undefined;
	let generation = 0;
	let scrolling = false;
	let prepared = false;
	let started = false;

	function clear() {
		generation++;
		cancelAnimationFrame(frame);
		frame = 0;
		if (scrollEnd) window.removeEventListener('scrollend', scrollEnd);
		scrollEnd = undefined;
		for (const effect of effects) effect.cancel();
		effects = [];
		// Commit the underlying destination with transitions still disabled.
		if (transitions.length) document.getElementById('main-grid')?.getBoundingClientRect();
		for (const { element, value, priority } of transitions) {
			if (value) element.style.setProperty('transition', value, priority);
			else element.style.removeProperty('transition');
		}
		transitions = [];
		prepared = started = scrolling = false;
		delete document.body.dataset.bannerNavigation;
	}

	function currentFrames() {
		return destinations.map(track => ({ ...track, from: getComputedStyle(track.element)[track.property] }));
	}

	function cancelEffects() {
		generation++;
		cancelAnimationFrame(frame);
		frame = 0;
		if (scrollEnd) window.removeEventListener('scrollend', scrollEnd);
		scrollEnd = undefined;
		for (const effect of effects) effect.cancel();
		effects = [];
	}

	function animateLayoutOnly(tracks = currentFrames()) {
		cancelEffects();
		const token = generation;
		scrolling = false;
		effects = tracks.filter(({ from, to }) => from !== to).map(({ element, property, from, to }) =>
			element.animate([{ [property]: from }, { [property]: to }], {
				duration: 600, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'both',
			}));
		Promise.all(effects.map(effect => effect.finished)).then(() => {
			if (generation === token) { clear(); onFinish(); }
		}).catch(() => { /* A new visit or user input replaced these effects. */ });
	}

	return {
		get prepared() { return prepared; },
		get started() { return started; },
		// A new visit can start before the previous visual transition finishes.
		// Freeze its current presentation so the next transition starts there.
		freeze() {
			generation++;
			cancelAnimationFrame(frame); frame = 0; scrolling = false;
			if (scrollEnd) window.removeEventListener('scrollend', scrollEnd);
			scrollEnd = undefined;
			for (const effect of effects) effect.pause();
		},
		cancelScroll() {
			if (prepared && scrolling) animateLayoutOnly();
			scrolling = false;
		},
		finish() {
			if (scrolling) window.scrollTo({ top: window.scrollY, behavior: 'instant' });
			clear(); onFinish();
		},
		prepare(updateLayout: () => void) {
			const snapshots = properties.flatMap(([id, property]) => {
				const element = document.getElementById(id);
				return element ? [{ element, property, from: getComputedStyle(element)[property] }] : [];
			});
			clear();
			transitions = snapshots.map(({ element }) => ({
				element,
				value: element.style.getPropertyValue('transition'),
				priority: element.style.getPropertyPriority('transition'),
			}));
			for (const { element } of transitions) element.style.setProperty('transition', 'none', 'important');
			updateLayout();
			// Read all destination styles before installing the paused animations.
			destinations = snapshots.map(snapshot => ({
				...snapshot, to: getComputedStyle(snapshot.element)[snapshot.property],
			}));
			const gridTransform = destinations.find(({ element }) => element.id === 'main-grid')?.to;
			const gridOffset = gridTransform && gridTransform !== 'none' ? new DOMMatrixReadOnly(gridTransform).m42 : 0;
			for (const { element, property, from, to } of destinations) {
				if (from === to) continue;
				const effect = element.animate([{ [property]: from }, { [property]: to }], { duration: 1, fill: 'both' });
				effect.pause();
				effect.currentTime = 0;
				effects.push(effect);
			}
			prepared = true;
			document.body.dataset.bannerNavigation = 'true';
			return gridOffset;
		},
		start(target: number, animate: boolean, restoreScroll = true) {
			if (!prepared) return;
			target = Math.max(0, Math.min(target, document.documentElement.scrollHeight - innerHeight));
			const tracks = started ? currentFrames() : destinations;
			cancelEffects();
			started = true;
			scrolling = restoreScroll;
			const from = window.scrollY;
			if (!animate) {
				if (restoreScroll) window.scrollTo({ top: target, behavior: 'instant' });
				clear(); onFinish();
				return;
			}
			if (!restoreScroll || Math.abs(target - from) < 1) {
				animateLayoutOnly(tracks);
				return;
			}

			const ScrollTimelineClass = (window as Window & {
				ScrollTimeline?: new (options: { source: Element; axis: string }) => AnimationTimeline;
			}).ScrollTimeline;
			if (ScrollTimelineClass && document.scrollingElement && 'onscrollend' in window) {
				// Native scrolling and these effects are sampled by the browser,
				// not a JS frame loop. The layout follows the actual scroll progress
				// even when page hydration temporarily occupies the main thread.
				const timeline = new ScrollTimelineClass({ source: document.scrollingElement, axis: 'block' });
				const options = {
					timeline, rangeStart: `${Math.min(from, target)}px`, rangeEnd: `${Math.max(from, target)}px`,
					fill: 'both', easing: 'linear',
				} as KeyframeAnimationOptions & { timeline: AnimationTimeline; rangeStart: string; rangeEnd: string };
				const nativeEffects = tracks.filter(track => track.from !== track.to).map(({ element, property, from: oldValue, to }) => {
					const values = from < target ? [oldValue, to] : [to, oldValue];
					return element.animate(values.map(value => ({ [property]: value })), options);
				});
				// A new scroll timeline has no resolved time until the browser's
				// next sample. Keep the old pose above it until then to avoid a
				// one-frame flash of the final layout before scrolling starts.
				const holds = tracks.map(({ element, property, from }) => {
					const hold = element.animate([{ [property]: from }, { [property]: from }], { duration: 1, fill: 'both' });
					hold.pause(); hold.currentTime = 0;
					return hold;
				});
				effects = [...nativeEffects, ...holds];
				const token = generation;
				Promise.all(nativeEffects.map(effect => effect.ready)).then(() => {
					if (generation !== token) return;
					for (const hold of holds) hold.cancel();
					effects = nativeEffects;
					scrollEnd = () => {
						// Ignore a queued scrollend from the scroll we interrupted.
						if (Math.abs(window.scrollY - target) < 1) { clear(); onFinish(); }
					};
					window.addEventListener('scrollend', scrollEnd);
					window.scrollTo({ top: target, behavior: 'smooth' });
				}).catch(() => { /* Superseded before the timeline became ready. */ });
				return;
			}

			// Fallback for browsers without scroll-driven animations.
			effects = tracks.filter(track => track.from !== track.to).map(({ element, property, from, to }) => {
				const effect = element.animate([{ [property]: from }, { [property]: to }], { duration: 1, fill: 'both' });
				effect.pause(); effect.currentTime = 0;
				return effect;
			});
			const start = performance.now();
			const duration = 600;
			const tick = (now: number) => {
				const progress = duration ? Math.min(1, (now - start) / duration) : 1;
				const eased = progress * progress * (3 - 2 * progress);
				for (const effect of effects) effect.currentTime = eased;
				if (scrolling) window.scrollTo({ top: from + (target - from) * eased, behavior: 'instant' });
				if (progress < 1) frame = requestAnimationFrame(tick);
				else { clear(); onFinish(); }
			};
			tick(start);
		},
	};
}
