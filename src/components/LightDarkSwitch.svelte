<script lang="ts">
import { DARK_MODE, LIGHT_MODE, SYSTEM_MODE } from "@constants/constants.ts";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import { getStoredTheme, setThemeFromPoint } from "@utils/setting-utils.ts";
import type { LIGHT_DARK_MODE } from "@/types/config.ts";

let isDark = $state(document.documentElement.classList.contains("dark"));
let activeMode = $state<LIGHT_DARK_MODE>(getStoredTheme());
let menuOpen = $state(false);
let switchRoot: HTMLDivElement;

const themeOptions: Array<{
	mode: LIGHT_DARK_MODE;
	label: string;
	icon: string;
}> = [
	{ mode: LIGHT_MODE, label: "亮色", icon: "material-symbols:light-mode-outline-rounded" },
	{ mode: DARK_MODE, label: "暗色", icon: "material-symbols:dark-mode-outline-rounded" },
	{ mode: SYSTEM_MODE, label: "跟随系统", icon: "material-symbols:contrast-rounded" },
];

function switchScheme(newMode: LIGHT_DARK_MODE, event: MouseEvent) {
	if (activeMode === newMode) {
		menuOpen = false;
		return;
	}
	if (!setThemeFromPoint(newMode, event.clientX, event.clientY)) return;
	activeMode = newMode;
	isDark = document.documentElement.classList.contains("dark");
	menuOpen = false;
}

function toggleScheme(event: MouseEvent) {
	const cycle: LIGHT_DARK_MODE[] = [LIGHT_MODE, DARK_MODE, SYSTEM_MODE];
	const currentIndex = cycle.indexOf(activeMode);
	const newMode = cycle[(currentIndex + 1) % cycle.length];
	if (!setThemeFromPoint(newMode, event.clientX, event.clientY)) return;
	activeMode = newMode;
	isDark = newMode === DARK_MODE || (
		newMode === SYSTEM_MODE &&
		window.matchMedia("(prefers-color-scheme: dark)").matches
	);
}

function openMenu() {
	menuOpen = true;
}

function closeMenuAfterPointerLeave() {
	if (!switchRoot.matches(":focus-within")) menuOpen = false;
}

function handleFocusOut(event: FocusEvent) {
	const nextTarget = event.relatedTarget;
	if (!(nextTarget instanceof Node) || !switchRoot.contains(nextTarget)) menuOpen = false;
}

function handleTriggerKeydown(event: KeyboardEvent) {
	if (event.key !== "ArrowDown") return;
	event.preventDefault();
	menuOpen = true;
	requestAnimationFrame(() => {
		switchRoot.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
	});
}

function syncThemeState() {
	activeMode = getStoredTheme();
	isDark = document.documentElement.classList.contains("dark");
}

onMount(() => {
	const handleThemeChange = () => requestAnimationFrame(syncThemeState);
	const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const handlePointerDown = (event: PointerEvent) => {
		if (menuOpen && !switchRoot.contains(event.target as Node)) menuOpen = false;
	};
	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") menuOpen = false;
	};
	window.addEventListener("theme-change", handleThemeChange);
	document.addEventListener("astro:page-load", handleThemeChange);
	document.addEventListener("pointerdown", handlePointerDown);
	document.addEventListener("keydown", handleKeydown);
	systemThemeQuery.addEventListener("change", handleThemeChange);
	handleThemeChange();

	return () => {
		window.removeEventListener("theme-change", handleThemeChange);
		document.removeEventListener("astro:page-load", handleThemeChange);
		document.removeEventListener("pointerdown", handlePointerDown);
		document.removeEventListener("keydown", handleKeydown);
		systemThemeQuery.removeEventListener("change", handleThemeChange);
	};
});
</script>

<div
	class="theme-mode-switch"
	bind:this={switchRoot}
	onpointerenter={openMenu}
	onpointerleave={closeMenuAfterPointerLeave}
	onfocusin={openMenu}
	onfocusout={handleFocusOut}
>
	<button
		type="button"
		aria-label={`快速切换主题，当前：${activeMode === SYSTEM_MODE ? "跟随系统" : isDark ? "暗色" : "亮色"}`}
		aria-haspopup="menu"
		aria-expanded={menuOpen}
		class:active={menuOpen}
		class="theme-mode-trigger btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90"
		id="scheme-switch"
		title="点击依次切换亮色、暗色和跟随系统；悬浮可直接选择"
		onclick={toggleScheme}
		onkeydown={handleTriggerKeydown}
	>
		{#if activeMode === SYSTEM_MODE}
			<Icon icon="material-symbols:contrast-rounded" class="text-[1.25rem]"></Icon>
		{:else if isDark}
			<Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
		{:else}
			<Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
		{/if}
	</button>

	<div
		class:open={menuOpen}
		class="theme-mode-menu"
		role="menu"
		aria-label="选择主题模式"
		aria-hidden={!menuOpen}
	>
		{#each themeOptions as option}
			<button
			type="button"
			role="menuitemradio"
			aria-checked={activeMode === option.mode}
			tabindex={menuOpen ? 0 : -1}
			class:active={activeMode === option.mode}
			class="theme-mode-option"
			onclick={(event) => switchScheme(option.mode, event)}
			>
				<Icon icon={option.icon}></Icon>
				<span>{option.label}</span>
				<span class="theme-mode-check" aria-hidden="true">
					<Icon icon="material-symbols:check-rounded"></Icon>
				</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.theme-mode-switch {
		position: relative;
		z-index: 60;
	}

	.theme-mode-trigger {
		position: relative;
	}

	.theme-mode-trigger.active {
		color: var(--primary);
		background: var(--btn-plain-bg-hover);
	}

	.theme-mode-menu::before { content: ''; position: absolute; left: 0; right: 0; top: -0.9rem; height: 0.9rem; }
	.theme-mode-menu {
		position: absolute;
		top: calc(100% + 0.85rem);
		right: 0;
		display: grid;
		width: 9.25rem;
		padding: 0.4rem;
		border: 1px solid var(--line-color);
		border-radius: 0.9rem;
		background: var(--card-bg);
		box-shadow: 0 0.8rem 2rem rgba(15, 23, 42, 0.2);
		backdrop-filter: blur(18px);
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transform: translateY(-0.35rem) scale(0.97);
		transform-origin: 82% 0;
		transition:
			opacity 150ms ease,
			transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
			visibility 0s linear 180ms;
	}

	.theme-mode-menu.open {
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
		transform: translateY(0) scale(1);
		transition-delay: 0s;
	}

	.theme-mode-option {
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr) 1rem;
		min-height: 2.45rem;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.55rem;
		border-radius: 0.65rem;
		color: var(--content-meta);
		font-size: 0.82rem;
		font-weight: 650;
		text-align: left;
		transition: color 150ms ease, background-color 150ms ease;
	}

	.theme-mode-option:hover,
	.theme-mode-option:focus-visible {
		color: var(--btn-content);
		background: var(--btn-plain-bg-hover);
	}

	.theme-mode-option:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
	}

	.theme-mode-option.active {
		color: var(--primary);
		background: var(--signal-soft);
	}

	.theme-mode-check {
		display: inline-flex;
		opacity: 0;
		transform: scale(0.7);
		transition: opacity 150ms ease, transform 150ms ease;
	}

	.theme-mode-option.active .theme-mode-check {
		opacity: 1;
		transform: scale(1);
	}

	@media (prefers-reduced-motion: reduce) {
		.theme-mode-menu,
		.theme-mode-option,
		.theme-mode-check {
			transition: none;
		}
	}
</style>
