import {
	DARK_MODE,
	DEFAULT_THEME,
	LIGHT_MODE,
	SYSTEM_MODE,
} from "@constants/constants";
import type { AccentPreset, LIGHT_DARK_MODE } from "@/types/config";

const WAVES_STORAGE_KEY = "bannerWavesEnabled";
const SHARED_THEME_COOKIE = "tonks_theme";
const ACCENT_STORAGE_KEYS = {
	light: "accentLight",
	dark: "accentDark",
} as const;
const DEFAULT_ACCENTS: Record<AccentMode, AccentPreset> = {
	light: "blue",
	dark: "gold",
};

export type AccentMode = keyof typeof ACCENT_STORAGE_KEYS;

function isThemeMode(value: string | null): value is LIGHT_DARK_MODE {
	return value === LIGHT_MODE || value === DARK_MODE || value === SYSTEM_MODE;
}

function readSharedTheme(): LIGHT_DARK_MODE | null {
	const prefix = `${SHARED_THEME_COOKIE}=`;
	const entry = document.cookie
		.split("; ")
		.find((item) => item.startsWith(prefix));
	if (!entry) return null;
	try {
		const value = decodeURIComponent(entry.slice(prefix.length));
		return isThemeMode(value) ? value : null;
	} catch {
		return null;
	}
}

function writeSharedTheme(theme: LIGHT_DARK_MODE): void {
	const hostname = window.location.hostname.toLowerCase();
	const sharedDomain =
		hostname === "tonks.top" || hostname.endsWith(".tonks.top");
	const attributes = [
		"Path=/",
		"Max-Age=31536000",
		"SameSite=Lax",
		...(sharedDomain ? ["Domain=.tonks.top", "Secure"] : []),
	];
	// biome-ignore lint/suspicious/noDocumentCookie: theme preference intentionally spans tonks.top subdomains.
	document.cookie = `${SHARED_THEME_COOKIE}=${theme}; ${attributes.join("; ")}`;
}

function persistTheme(theme: LIGHT_DARK_MODE): void {
	localStorage.setItem("theme", theme);
	writeSharedTheme(theme);
}

export function isAccentPreset(value: string | null): value is AccentPreset {
	return value === "blue" || value === "gold";
}

export function getDefaultAccent(mode: AccentMode): AccentPreset {
	const configCarrier = document.getElementById("config-carrier");
	const configured =
		mode === "light"
			? configCarrier?.dataset.accentLightDefault
			: configCarrier?.dataset.accentDarkDefault;
	const candidate = configured ?? null;
	return isAccentPreset(candidate) ? candidate : DEFAULT_ACCENTS[mode];
}

export function getAccent(mode: AccentMode): AccentPreset {
	const stored = localStorage.getItem(ACCENT_STORAGE_KEYS[mode]);
	return isAccentPreset(stored) ? stored : getDefaultAccent(mode);
}

export function setAccent(mode: AccentMode, preset: AccentPreset): void {
	localStorage.setItem(ACCENT_STORAGE_KEYS[mode], preset);
	document.documentElement.dataset[
		mode === "light" ? "accentLight" : "accentDark"
	] = preset;
	window.dispatchEvent(
		new CustomEvent("accent-change", {
			detail: { mode, preset },
		}),
	);
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
	window.dispatchEvent(
		new CustomEvent("waves-change", { detail: { enabled } }),
	);
}

function commitTheme(theme: LIGHT_DARK_MODE): boolean {
	const root = document.documentElement;
	const targetIsDark = isThemeDark(theme);
	const expressiveTheme = targetIsDark ? "github-dark" : "github-light";
	const changed =
		root.classList.contains("dark") !== targetIsDark ||
		root.dataset.theme !== expressiveTheme;

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
	persistTheme(theme);
	applyThemeToDocument(theme);
}

export function setThemeFromPoint(
	theme: LIGHT_DARK_MODE,
	x: number,
	y: number,
): void {
	persistTheme(theme);
	const root = document.documentElement;
	const reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
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

	const radius = Math.hypot(
		Math.max(x, innerWidth - x),
		Math.max(y, innerHeight - y),
	);
	// Chrome 的 ::view-transition-new(root) 渲染盒可能不等于 100vw×100vh，
	// 改用百分比坐标/半径，circle() 百分比以元素自身盒为准，各浏览器行为一致。
	const px = (x / innerWidth) * 100;
	const py = (y / innerHeight) * 100;
	const pr =
		((radius * Math.SQRT2) / Math.hypot(innerWidth, innerHeight)) * 100;
	root.style.setProperty("--theme-reveal-x", `${px}%`);
	root.style.setProperty("--theme-reveal-y", `${py}%`);
	root.style.setProperty("--theme-reveal-radius", `${pr}%`);
	root.classList.add("is-theme-revealing");

	const transition = viewTransitionDocument.startViewTransition(() => {
		announceThemeChange(commitTheme(theme));
	});
	transition.finished.finally(() =>
		root.classList.remove("is-theme-revealing"),
	);
}

export function getStoredTheme(): LIGHT_DARK_MODE {
	const sharedTheme = readSharedTheme();
	if (sharedTheme) {
		if (localStorage.getItem("theme") !== sharedTheme)
			localStorage.setItem("theme", sharedTheme);
		return sharedTheme;
	}
	const storedTheme = localStorage.getItem("theme");
	if (isThemeMode(storedTheme)) {
		writeSharedTheme(storedTheme);
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
	const syncSharedTheme = () => {
		const sharedTheme = readSharedTheme();
		if (!sharedTheme || localStorage.getItem("theme") === sharedTheme) return;
		localStorage.setItem("theme", sharedTheme);
		applyThemeToDocument(sharedTheme);
	};
	window.addEventListener("focus", syncSharedTheme);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") syncSharedTheme();
	});
}
