/** Keep the banner's layout motion and window scrolling on one timeline. */
export function createBannerNavigation(onFinish: () => void) {
	const properties = [
		['banner-wrapper', 'transform'],
		['home-sticker-motion', 'transform'],
		['banner', 'transform'],
		['main-grid', 'transform'],
		['sidebar', 'transform'],
		['sidebar-sticky', 'transform'],
	] as const;
	let effects: Animation[] = [];
	let destinations: Array<{ element: HTMLElement; property: 'transform'; from: string; to: string }> = [];
	let transitions: Array<{ element: HTMLElement; value: string; priority: string }> = [];
	let generation = 0;
	let scrolling = false;
	let prepared = false;
	let started = false;
	const readStickyPositions = () => ['sidebar', 'sidebar-sticky'].flatMap(id => {
		const element = document.getElementById(id);
		return element ? [{element, top: element.getBoundingClientRect().top}] : [];
	});
	function compensateSticky(positions: ReturnType<typeof readStickyPositions>, tracks = destinations, paused = false) {
		// Correct parent before child, so nested compensation is not counted twice.
		for (const {element, top} of positions) {
			const delta = top - element.getBoundingClientRect().top;
			if (Math.abs(delta) < .5) continue;
			const track = tracks.find(track => track.element === element);
			if (!track) continue;
			const value = getComputedStyle(element).transform;
			const matrix = new DOMMatrix(value === 'none' ? undefined : value);
			matrix.m42 += delta;
			track.from = matrix.toString();
			const frames = [{transform: track.from}, {transform: track.to}];
			const existing = effects.find(effect => (effect.effect as KeyframeEffect)?.target === element);
			if (existing) (existing.effect as KeyframeEffect).setKeyframes(frames);
			else {
				const effect = element.animate(frames, {
					duration: paused ? 1 : 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both',
				});
				if (paused) { effect.pause(); effect.currentTime = 0; }
				effects.push(effect);
			}
		}
	}

	function clear() {
		generation++;
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
		for (const effect of effects) effect.cancel();
		effects = [];
	}

	function animateLayoutOnly(tracks = currentFrames(), afterStart?: () => void) {
		cancelEffects();
		const token = generation;
		scrolling = false;
		effects = tracks.filter(({ from, to }) => from !== to).map(({ element, property, from, to }) =>
			element.animate([{ [property]: from }, { [property]: to }], {
				duration: 600, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both',
			}));
		afterStart?.();
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
			scrolling = false;
			for (const effect of effects) effect.pause();
		},
		cancelScroll() {
			if (prepared && scrolling) {
				const grid = destinations.find(track => track.element.id === 'main-grid');
				if (grid) {
					const current = new DOMMatrixReadOnly(getComputedStyle(grid.element).transform).m42;
					const final = new DOMMatrixReadOnly(grid.to === 'none' ? undefined : grid.to).m42;
					const target = window.scrollY - (current - final);
					clear();
					window.scrollTo({ top: Math.max(0, target), behavior: 'instant' });
					onFinish();
				}
			}
			scrolling = false;
		},
		finish() {
			if (scrolling) window.scrollTo({ top: window.scrollY, behavior: 'instant' });
			clear(); onFinish();
		},
		prepare(updateLayout: () => void) {
			const stickyPositions = readStickyPositions();
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
			compensateSticky(stickyPositions, destinations, true);
			prepared = true;
			document.body.dataset.bannerNavigation = 'true';
			return gridOffset;
		},
		start(target: number, animate: boolean, restoreScroll = true) {
			if (!prepared) return;
			target = Math.max(0, Math.min(target, document.documentElement.scrollHeight - innerHeight));
			const tracks = started ? currentFrames() : destinations;
			const stickyPositions = readStickyPositions();
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

			// Commit the real scroll once; animate only the visual displacement.
			const offset = target - from;
			const visualTracks = tracks.map(track => {
				if (track.element.id !== 'main-grid' && track.element.id !== 'banner-wrapper') return track;
				const matrix = new DOMMatrix(track.from === 'none' ? undefined : track.from);
				matrix.m42 += offset;
				return { ...track, from: matrix.toString() };
			});
			window.scrollTo({ top: target, behavior: 'instant' });
			animateLayoutOnly(visualTracks, () => compensateSticky(stickyPositions, visualTracks));
			scrolling = true;
		},
	};
}
