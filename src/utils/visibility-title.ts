export const AWAY_PAGE_TITLE = "再逛逛呗~不要走(;﹏;)";

interface VisibilityTitleRuntime extends Window {
	__tonksVisibilityTitleCleanup?: () => void;
}

export interface VisibilityTitleState {
	pageTitle: string;
	visibleTitle: string;
}

export function resolveVisibilityTitle(
	visibleTitle: string,
	currentTitle: string,
	hidden: boolean,
): VisibilityTitleState {
	const nextVisibleTitle =
		currentTitle && currentTitle !== AWAY_PAGE_TITLE
			? currentTitle
			: visibleTitle;

	return {
		pageTitle: hidden ? AWAY_PAGE_TITLE : nextVisibleTitle,
		visibleTitle: nextVisibleTitle,
	};
}

export function installVisibilityTitle() {
	if (typeof window === "undefined" || typeof document === "undefined") return;

	const runtime = window as VisibilityTitleRuntime;
	if (runtime.__tonksVisibilityTitleCleanup) return;

	let visibleTitle = document.title;
	let writingTitle = false;

	const writeTitle = (title: string) => {
		if (!title || document.title === title) return;
		writingTitle = true;
		document.title = title;
		queueMicrotask(() => {
			writingTitle = false;
		});
	};

	const syncTitle = () => {
		const next = resolveVisibilityTitle(
			visibleTitle,
			document.title,
			document.hidden,
		);
		visibleTitle = next.visibleTitle;
		writeTitle(next.pageTitle);
	};

	const titleObserver = new MutationObserver(() => {
		if (writingTitle) return;
		syncTitle();
	});

	titleObserver.observe(document.head, {
		childList: true,
		subtree: true,
		characterData: true,
	});
	document.addEventListener("visibilitychange", syncTitle);
	syncTitle();

	runtime.__tonksVisibilityTitleCleanup = () => {
		titleObserver.disconnect();
		document.removeEventListener("visibilitychange", syncTitle);
		if (document.title === AWAY_PAGE_TITLE) document.title = visibleTitle;
		delete runtime.__tonksVisibilityTitleCleanup;
	};
}
