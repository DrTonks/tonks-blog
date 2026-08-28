import { getBlogClientId } from "./visitor-id";

const API_BASE = (import.meta.env.PUBLIC_SLEEPY_API_BASE || "/api").replace(/\/$/, "");
const REQUIRED_VISIBLE_MS = 5_000;

type ViewTracker = {
	cancel: () => void;
};

let activeViewTracker: ViewTracker | undefined;
let scheduledFrame: number | undefined;
let initializationId = 0;

type ViewsResponse = {
	success: boolean;
	views: Record<string, number>;
};

type RecordViewResponse = {
	success: boolean;
	slug: string;
	views: number;
	counted: boolean;
};

function updateSlug(slug: string, views: number): void {
	for (const element of document.querySelectorAll<HTMLElement>("[data-blog-views]")) {
		if (element.dataset.blogViews === slug) {
			element.textContent = `${views} 浏览`;
		}
	}
}

async function loadViewTotals(elements: HTMLElement[]): Promise<void> {
	const slugs = [...new Set(elements.map((element) => element.dataset.blogViews).filter(Boolean))] as string[];
	if (slugs.length === 0) return;

	const params = new URLSearchParams();
	for (const slug of slugs) params.append("slugs", slug);
	const response = await fetch(`${API_BASE}/blog/views?${params.toString()}`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`view totals returned HTTP ${response.status}`);
	const result = (await response.json()) as ViewsResponse;
	if (!result.success) throw new Error("view totals request failed");
	for (const [slug, views] of Object.entries(result.views)) updateSlug(slug, views);
}

async function recordDetailView(element: HTMLElement, slug: string): Promise<void> {
	if (element.dataset.blogViewTracked === "true") return;
	element.dataset.blogViewTracked = "true";

	const response = await fetch(`${API_BASE}/blog/views/${encodeURI(slug)}`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"X-Client-ID": getBlogClientId(),
		},
	});
	if (!response.ok) throw new Error(`view counter returned HTTP ${response.status}`);
	const result = (await response.json()) as RecordViewResponse;
	if (!result.success) throw new Error("view counter request failed");
	updateSlug(result.slug, result.views);
}

function startDetailViewTracker(element: HTMLElement): ViewTracker | undefined {
	const slug = element.dataset.blogViews;
	if (!slug || element.dataset.blogViewTracked === "true") return;

	let cancelled = false;
	let visibleSince: number | undefined;
	let visibleElapsed = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const clearTimer = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	const finish = (): void => {
		if (cancelled) return;
		cancelled = true;
		clearTimer();
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		void recordDetailView(element, slug).catch((error) => {
			delete element.dataset.blogViewTracked;
			console.warn("[blog views] failed to record detail view", error);
		});
	};

	const beginVisiblePeriod = (): void => {
		if (cancelled || document.hidden || visibleSince !== undefined) return;
		visibleSince = performance.now();
		timer = setTimeout(finish, Math.max(0, REQUIRED_VISIBLE_MS - visibleElapsed));
	};

	const endVisiblePeriod = (): void => {
		if (visibleSince === undefined) return;
		visibleElapsed += performance.now() - visibleSince;
		visibleSince = undefined;
		clearTimer();
	};

	function handleVisibilityChange(): void {
		if (document.hidden) {
			endVisiblePeriod();
		} else if (visibleElapsed >= REQUIRED_VISIBLE_MS) {
			finish();
		} else {
			beginVisiblePeriod();
		}
	}

	document.addEventListener("visibilitychange", handleVisibilityChange);
	beginVisiblePeriod();

	return {
		cancel(): void {
			if (cancelled) return;
			cancelled = true;
			endVisiblePeriod();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		},
	};
}

export async function initializeBlogViews(): Promise<void> {
	const currentInitializationId = ++initializationId;
	activeViewTracker?.cancel();
	activeViewTracker = undefined;

	const elements = [...document.querySelectorAll<HTMLElement>("[data-blog-views]")];
	if (elements.length === 0) return;

	try {
		await loadViewTotals(elements);
	} catch (error) {
		console.warn("[blog views] failed to load totals", error);
	}

	// A newer Swup navigation/initialization supersedes this async run.
	if (currentInitializationId !== initializationId) return;

	const detailElement = elements.find((item) => item.dataset.trackView === "true");
	if (detailElement) activeViewTracker = startDetailViewTracker(detailElement);
}

function scheduleBlogViews(): void {
	// Cancel synchronously so the previous article cannot reach its threshold
	// between a Swup navigation event and the next animation frame.
	initializationId += 1;
	activeViewTracker?.cancel();
	activeViewTracker = undefined;
	if (scheduledFrame !== undefined) cancelAnimationFrame(scheduledFrame);
	scheduledFrame = requestAnimationFrame(() => {
		scheduledFrame = undefined;
		void initializeBlogViews();
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", scheduleBlogViews, { once: true });
} else {
	scheduleBlogViews();
}

function registerSwupHook(): void {
	const swup = (window as Window & {
		swup?: { hooks?: { on: (name: string, callback: () => void) => void } };
	}).swup;
	swup?.hooks?.on("page:view", scheduleBlogViews);
}

if ((window as Window & { swup?: unknown }).swup) {
	registerSwupHook();
} else {
	document.addEventListener("swup:enable", registerSwupHook, { once: true });
}
