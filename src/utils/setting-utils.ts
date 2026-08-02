import {
	DARK_MODE,
	DEFAULT_THEME,
	LIGHT_MODE,
	SYSTEM_MODE,
} from "@constants/constants";
import { expressiveCodeConfig } from "@/config";
import type { LIGHT_DARK_MODE } from "@/types/config";

const WAVES_STORAGE_KEY = "bannerWavesEnabled";

export function getDefaultHue(): number {
	const fallback = "250";
	const configCarrier = document.getElementById("config-carrier");
	return Number.parseInt(configCarrier?.dataset.hue || fallback);
}

export function getHue(): number {
	const stored = localStorage.getItem("hue");
	return stored ? Number.parseInt(stored) : getDefaultHue();
}

export function setHue(hue: number): void {
	localStorage.setItem("hue", String(hue));
	const r = document.querySelector(":root") as HTMLElement;
	if (!r) {
		return;
	}
	r.style.setProperty("--hue", String(hue));
}

export function getDefaultWavesEnabled(): boolean {
	const configCarrier = document.getElementById("config-carrier");
	return configCarrier?.dataset.wavesDefault === "true";
}

export function getWavesEnabled(): boolean {
	const stored = localStorage.getItem(WAVES_STORAGE_KEY);
	if (stored === "true") return true;
	if (stored === "false") return false;
	return getDefaultWavesEnabled();
}

export function setWavesEnabled(enabled: boolean): void {
	localStorage.setItem(WAVES_STORAGE_KEY, String(enabled));
	document.documentElement.dataset.waves = enabled ? "on" : "off";
	window.dispatchEvent(new CustomEvent("waves-change", { detail: { enabled } }));
}

function commitTheme(theme: LIGHT_DARK_MODE): boolean {
	const root = document.documentElement;
	const targetIsDark = isThemeDark(theme);
	const expressiveTheme = targetIsDark ? "github-dark" : "github-light";
	const changed = root.classList.contains("dark") !== targetIsDark || root.dataset.theme !== expressiveTheme;

	root.classList.toggle("dark", targetIsDark);
	root.dataset.theme = expressiveTheme;
	return changed;
}

function announceThemeChange(changed: boolean): void {
	if (!changed) return;
	setTimeout(() => window.dispatchEvent(new CustomEvent("theme-change")), 0);
}

export function applyThemeToDocument(theme: LIGHT_DARK_MODE) {
	const root = document.documentElement;
	root.classList.add("is-theme-transitioning");
	const changed = commitTheme(theme);
	announceThemeChange(changed);
	requestAnimationFrame(() => root.classList.remove("is-theme-transitioning"));
}

export function setTheme(theme: LIGHT_DARK_MODE): void {
	localStorage.setItem("theme", theme);
	applyThemeToDocument(theme);
}

export function setThemeFromPoint(theme: LIGHT_DARK_MODE, x: number, y: number): void {
	localStorage.setItem("theme", theme);
	const root = document.documentElement;
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const viewTransitionDocument = document as Document & {
		startViewTransition?: (update: () => void) => {
			ready: Promise<void>;
			finished: Promise<void>;
		};
	};

	if (!viewTransitionDocument.startViewTransition || reducedMotion) {
		applyThemeToDocument(theme);
		return;
	}

	const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
	root.style.setProperty("--theme-reveal-x", `${x}px`);
	root.style.setProperty("--theme-reveal-y", `${y}px`);
	root.style.setProperty("--theme-reveal-radius", `${radius}px`);
	root.classList.add("is-theme-revealing");

	const transition = viewTransitionDocument.startViewTransition(() => {
		announceThemeChange(commitTheme(theme));
	});
	transition.finished.finally(() => root.classList.remove("is-theme-revealing"));
}

export function getStoredTheme(): LIGHT_DARK_MODE {
	const storedTheme = localStorage.getItem("theme");
	if (
		storedTheme === LIGHT_MODE ||
		storedTheme === DARK_MODE ||
		storedTheme === SYSTEM_MODE
	) {
		return storedTheme;
	}
	return DEFAULT_THEME;
}

export function isThemeDark(theme: LIGHT_DARK_MODE): boolean {
	return (
		theme === DARK_MODE ||
		(theme === SYSTEM_MODE &&
			window.matchMedia("(prefers-color-scheme: dark)").matches)
	);
}

if (typeof window !== "undefined") {
	const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
	systemThemeQuery.addEventListener("change", () => {
		if (getStoredTheme() === SYSTEM_MODE) {
			applyThemeToDocument(SYSTEM_MODE);
		}
	});
}
