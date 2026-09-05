interface SwupHookRegistry {
	before<TVisit = unknown>(event: string, handler: (visit: TVisit) => void): void;
	on<TVisit = unknown>(event: string, handler: (visit: TVisit) => void): void;
}

interface SwupRuntime {
    scrollTo?: (target: number, animate?: boolean) => void;
	hooks: SwupHookRegistry;
	options: {
		animateHistoryBrowsing: boolean;
	};
}

declare global {
	interface HTMLElementTagNameMap {
		"table-of-contents": HTMLElement & {
			init?: () => void;
		};
	}

	interface Window {
		swup: SwupRuntime;
		dataLayer?: Array<Record<string, unknown>>;
		pagefind: {
			search: (query: string) => Promise<{
				results: Array<{
					data: () => Promise<SearchResult>;
				}>;
			}>;
		};

		mobileTOCInit?: () => void;
		initSemifullScrollDetection?: () => void;
		closeAnnouncement?: () => void;
		iconifyLoaded?: boolean;
		__tonksLayoutSwupHooksReady?: boolean;
		__tonksBannerTextExitTimer?: number;
		__tonksBannerPageTransitionPaused?: boolean;
		__tonksBannerCarouselCleanup?: () => void;
		__tonksBannerCarouselRuntime?: {
			root: HTMLElement;
			setPageTransitionPaused: (paused: boolean) => void;
		};
		__hanaleiFontLoadScheduled?: boolean;
		sakuraInitialized?: boolean;
		__tonksScrollProtectionInitialized?: boolean;
		__tonksTwikooInit?: () => void;
		__tonksTwikooHooksReady?: boolean;
		__tonksTwikooSwupHookReady?: boolean;
		scrollProtectionManager?: {
			disable: () => void;
			setPageTransitioning: (value: boolean) => void;
		};
	}
}

interface SearchResult {
	url: string;
	meta: {
		title: string;
	};
	excerpt: string;
	content?: string;
	word_count?: number;
	filters?: Record<string, unknown>;
	anchors?: Array<{
		element: string;
		id: string;
		text: string;
		location: number;
	}>;
	weighted_locations?: Array<{
		weight: number;
		balanced_score: number;
		location: number;
	}>;
	locations?: number[];
	raw_content?: string;
	raw_url?: string;
	sub_results?: SearchResult[];
}

export {};

