export const BANNER_CAROUSEL_CHANGE = "tonks:banner-carousel-change";
const STORAGE_KEY = "bannerCarouselEnabled";
let fallback = false;
let memoryOverride: boolean | null = null;

export function getBannerCarouselEnabled(): boolean {
	if (memoryOverride !== null) return memoryOverride;
	try {
		return localStorage.getItem(STORAGE_KEY) === "true";
	} catch {
		return fallback;
	}
}

export function setBannerCarouselEnabled(enabled: boolean): void {
	fallback = enabled;
	try {
		localStorage.setItem(STORAGE_KEY, String(enabled));
		memoryOverride = null;
	} catch {
		// Keep the setting for this session when storage is unavailable.
		memoryOverride = enabled;
	}
	window.dispatchEvent(new Event(BANNER_CAROUSEL_CHANGE));
}
