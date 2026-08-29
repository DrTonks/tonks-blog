const API_BASE = (import.meta.env.PUBLIC_SLEEPY_API_BASE || "/api").replace(
	/\/$/,
	"",
);
const SESSION_KEY = "tonks-site-visit-id:blog";

interface SiteVisitResponse {
	success: boolean;
	visits: number;
	counted?: boolean;
}

interface SiteVisitRuntime extends Window {
	__tonksSiteVisitsInstalled?: boolean;
	__tonksSiteVisitCount?: number;
}

function createVisitId(): string {
	if (typeof crypto.randomUUID === "function") {
		return crypto.randomUUID().replace(/-/g, "");
	}
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

function getVisitId(): string {
	try {
		const stored = sessionStorage.getItem(SESSION_KEY);
		if (stored) return stored;
		const created = createVisitId();
		sessionStorage.setItem(SESSION_KEY, created);
		return created;
	} catch {
		return createVisitId();
	}
}

function renderSiteVisits(visits: number): void {
	for (const element of document.querySelectorAll<HTMLElement>(
		"[data-site-visit-count]",
	)) {
		element.textContent = `${visits.toLocaleString("zh-CN")} 次`;
	}
}

async function requestSiteVisits(): Promise<number> {
	const visitId = getVisitId();
	const response = await fetch(`${API_BASE}/blog/site-visits`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"X-Site-Source": "blog",
			"X-Visit-ID": visitId,
		},
	});
	if (!response.ok) {
		throw new Error(`site visit counter returned HTTP ${response.status}`);
	}
	const result = (await response.json()) as SiteVisitResponse;
	if (!result.success || !Number.isFinite(result.visits)) {
		throw new Error("site visit counter returned an invalid response");
	}
	return result.visits;
}

async function loadSiteVisits(): Promise<number> {
	const response = await fetch(`${API_BASE}/blog/site-visits`, {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) {
		throw new Error(`site visit total returned HTTP ${response.status}`);
	}
	const result = (await response.json()) as SiteVisitResponse;
	if (!result.success || !Number.isFinite(result.visits)) {
		throw new Error("site visit total returned an invalid response");
	}
	return result.visits;
}

export function installSiteVisits(): void {
	if (typeof window === "undefined" || typeof document === "undefined") return;

	const runtime = window as SiteVisitRuntime;
	if (runtime.__tonksSiteVisitsInstalled) {
		if (runtime.__tonksSiteVisitCount !== undefined) {
			renderSiteVisits(runtime.__tonksSiteVisitCount);
		}
		return;
	}
	runtime.__tonksSiteVisitsInstalled = true;

	const renderCurrent = () => {
		if (runtime.__tonksSiteVisitCount !== undefined) {
			renderSiteVisits(runtime.__tonksSiteVisitCount);
		}
	};

	const registerSwupHook = () => {
		const swup = (
			window as Window & {
				swup?: { hooks?: { on: (name: string, callback: () => void) => void } };
			}
		).swup;
		swup?.hooks?.on("page:view", renderCurrent);
	};

	if ((window as Window & { swup?: unknown }).swup) {
		registerSwupHook();
	} else {
		document.addEventListener("swup:enable", registerSwupHook, { once: true });
	}

	void requestSiteVisits()
		.catch((error) => {
			console.warn("[site visits] failed to record visit", error);
			return loadSiteVisits();
		})
		.then((visits) => {
			runtime.__tonksSiteVisitCount = visits;
			renderSiteVisits(visits);
		})
		.catch((error) => {
			console.warn("[site visits] failed to load total", error);
		});
}
