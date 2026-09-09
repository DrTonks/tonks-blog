import {
	DARK_MODE,
	DEFAULT_THEME,
	LIGHT_MODE,
	SYSTEM_MODE,
} from "@constants/constants";
import type { AccentPreset, LIGHT_DARK_MODE } from "@/types/config";
import type { ThemeAvatarElement } from "./theme-avatar";

const WAVES_STORAGE_KEY = "bannerWavesEnabled";
export const AVATAR_PARTICLES_STORAGE_KEY = "avatarParticlesEnabled";
export const AVATAR_PARTICLES_CHANGE = "avatar-particles-change";
export const AVATAR_MOBILE_QUERY = "(max-width: 767px), (hover: none) and (pointer: coarse)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// Keep this tab usable when storage is blocked or full.
let avatarParticlesFallback: boolean | undefined;
// Session-only failure state: do not overwrite the user's saved preference.
// The renderer reports its real initialization result; no probe context is made.
let avatarParticlesUnavailable = false;

export function isAvatarParticlesSupported(): boolean {
	return !avatarParticlesUnavailable &&
		typeof document.startViewTransition === "function";
}

export function reportAvatarParticlesUnavailable(): void {
	if (avatarParticlesUnavailable) return;
	avatarParticlesUnavailable = true;
	window.dispatchEvent(new Event(AVATAR_PARTICLES_CHANGE));
}

export function getAvatarParticlesEnabled(): boolean {
	if (avatarParticlesFallback !== undefined) return avatarParticlesFallback;
	try {
		return localStorage.getItem(AVATAR_PARTICLES_STORAGE_KEY) !== "false";
	} catch {
		return true;
	}
}

export function setAvatarParticlesEnabled(enabled: boolean): void {
	avatarParticlesFallback = enabled;
	try {
		localStorage.setItem(AVATAR_PARTICLES_STORAGE_KEY, String(enabled));
		avatarParticlesFallback = undefined;
	} catch { /* The current tab still honors the choice. */ }
	window.dispatchEvent(new Event(AVATAR_PARTICLES_CHANGE));
}

export function canUseAvatarParticles(): boolean {
	return getAvatarParticlesEnabled() &&
		!window.matchMedia(AVATAR_MOBILE_QUERY).matches &&
		!window.matchMedia(REDUCED_MOTION_QUERY).matches &&
		isAvatarParticlesSupported();
}
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

// The navbar has independent banner/wallpaper/responsive transition rules.
// Freeze its surfaces before either snapshot, and resolve the target styles
// before restoring transitions; otherwise a pending background transition can
// be captured in the new snapshot and finish only after the reveal disappears.
const navbarSurfaceFreezes = new Map<HTMLElement, { count: number; value: string; priority: string }>();
function freezeNavbarThemeSurfaces(): () => void {
	const surfaces = Array.from(document.querySelectorAll<HTMLElement>(
		"#navbar > div, #navbar .float-panel, #navbar .theme-mode-menu",
	));
	for (const surface of surfaces) {
		const active = navbarSurfaceFreezes.get(surface);
		if (active) active.count++;
		else navbarSurfaceFreezes.set(surface, {
			count: 1,
			value: surface.style.getPropertyValue("transition"),
			priority: surface.style.getPropertyPriority("transition"),
		});
		surface.style.setProperty("transition", "none", "important");
	}
	for (const surface of surfaces) void getComputedStyle(surface).backgroundColor;
	return () => {
		// Read while still frozen so restoration cannot start a deferred theme tween.
		for (const surface of surfaces) void getComputedStyle(surface).backgroundColor;
		for (const surface of surfaces) {
			const active = navbarSurfaceFreezes.get(surface);
			if (!active || --active.count > 0) continue;
			const { value, priority } = active;
			if (value) surface.style.setProperty("transition", value, priority);
			else surface.style.removeProperty("transition");
			navbarSurfaceFreezes.delete(surface);
		}
	};
}

export function applyThemeToDocument(theme: LIGHT_DARK_MODE) {
	const root = document.documentElement;
	if (root.classList.contains("dark") === isThemeDark(theme)) {
		announceThemeChange(commitTheme(theme));
		return;
	}
	const restoreSurfaces = freezeNavbarThemeSurfaces();
	root.classList.add("is-theme-transitioning");
	const changed = commitTheme(theme);
	announceThemeChange(changed);
	requestAnimationFrame(() => {
		restoreSurfaces();
		root.classList.remove("is-theme-transitioning");
	});
}

export function setTheme(theme: LIGHT_DARK_MODE): void {
	persistTheme(theme);
	applyThemeToDocument(theme);
}

let themeRevealRunning = false;

export function setThemeFromPoint(
	theme: LIGHT_DARK_MODE,
	x: number,
	y: number,
): boolean {
	// Ignore repeated clicks while the snapshot transition owns the screen.
	if (themeRevealRunning) return false;
	persistTheme(theme);
	const root = document.documentElement;
	if (root.classList.contains("dark") === isThemeDark(theme)) {
		// Keep system/manual preference changes without a snapshot, particles or lock.
		announceThemeChange(commitTheme(theme));
		return true;
	}
	const motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
	const viewTransitionDocument = document as Document & {
		startViewTransition?: (update: () => void) => {
			ready: Promise<void>;
			finished: Promise<void>;
			skipTransition: () => void;
		};
	};

	if (!viewTransitionDocument.startViewTransition || motionQuery.matches) {
		applyThemeToDocument(theme);
		return true;
	}

	const radius = Math.hypot(
		Math.max(x, innerWidth - x),
		Math.max(y, innerHeight - y),
	);
	const avatar = document.querySelector<ThemeAvatarElement>("theme-avatar");
	const avatarTransition = canUseAvatarParticles() && root.classList.contains("dark") !== isThemeDark(theme)
		? avatar?.begin?.(isThemeDark(theme), x, y, radius, 560) : null;
	root.classList.add("is-theme-revealing");
	const restoreSurfaces = freezeNavbarThemeSurfaces();
	themeRevealRunning = true;
	let changed = false;
	let rootReveal: Animation | undefined;
	let stopForReducedMotion: (() => void) | undefined;
	let surfacesReleased = false;
	const releaseReveal = () => {
		if (surfacesReleased) return;
		surfacesReleased = true;
		restoreSurfaces();
		root.classList.remove("is-theme-revealing");
	};
	const finish = () => {
		if (stopForReducedMotion) motionQuery.removeEventListener("change", stopForReducedMotion);
		rootReveal?.cancel();
		avatarTransition?.cancel();
		avatarTransition?.cleanup();
		(avatar?.closest<HTMLElement>("[data-avatar-composite]") ?? avatar)?.style.removeProperty("view-transition-name");
		releaseReveal();
		themeRevealRunning = false;
		announceThemeChange(changed);
	};
	try {
		const transition = viewTransitionDocument.startViewTransition(() => {
			changed = commitTheme(theme);
			avatarTransition?.capture();
		});
		let motionStopped = false;
		stopForReducedMotion = () => {
			if (!motionQuery.matches || motionStopped) return;
			motionStopped = true;
			rootReveal?.cancel();
			avatarTransition?.cancel();
			avatarTransition?.cleanup();
			// Skipping still runs the update callback. Keep ownership until finished
			// settles; cancelling only the particle promise must never unlock it.
			transition.skipTransition();
		};
		motionQuery.addEventListener("change", stopForReducedMotion);
		stopForReducedMotion();
		void transition.ready.then(() => {
			stopForReducedMotion?.();
			if (motionStopped) return;
			// Normalize both clips to their snapshot boxes, sharing one timeline.
			const startTime = Number(document.timeline.currentTime ?? performance.now());
			const px = x / innerWidth * 100, py = y / innerHeight * 100;
			const percentRadius = radius * Math.SQRT2 / Math.hypot(innerWidth, innerHeight) * 100;
			rootReveal = root.animate({clipPath: [
				`circle(0% at ${px}% ${py}%)`, `circle(${percentRadius}% at ${px}% ${py}%)`,
			]}, {duration: 560, easing: "cubic-bezier(.22,.75,.18,1)", fill: "both", pseudoElement: "::view-transition-new(root)"});
			rootReveal.startTime = startTime;
			avatarTransition?.start(startTime);
		}).catch(() => {
			avatarTransition?.cancel();
			avatarTransition?.cleanup();
		});
		const revealDone = transition.finished.then(releaseReveal, () => {
			avatarTransition?.cancel();
			releaseReveal();
		});
		void Promise.all([revealDone, avatarTransition?.done]).then(finish, finish);
	} catch {
		changed = commitTheme(theme);
		finish();
	}
	return true;
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
	window.addEventListener("storage", (event) => {
		if (event.key !== null && event.key !== AVATAR_PARTICLES_STORAGE_KEY) return;
		try {
			if (event.storageArea && event.storageArea !== localStorage) return;
		} catch { return; }
		avatarParticlesFallback = undefined;
		window.dispatchEvent(new Event(AVATAR_PARTICLES_CHANGE));
	});
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
