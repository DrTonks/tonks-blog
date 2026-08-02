<script lang="ts">
import { DARK_MODE, LIGHT_MODE } from "@constants/constants.ts";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import { setThemeFromPoint } from "@utils/setting-utils.ts";
import type { LIGHT_DARK_MODE } from "@/types/config.ts";

let isDark = $state(document.documentElement.classList.contains("dark"));

function switchScheme(newMode: LIGHT_DARK_MODE, event: MouseEvent) {
	setThemeFromPoint(newMode, event.clientX, event.clientY);
	isDark = newMode === DARK_MODE;
}

function toggleScheme(event: MouseEvent) {
	switchScheme(isDark ? LIGHT_MODE : DARK_MODE, event);
}

function syncThemeState() {
	isDark = document.documentElement.classList.contains("dark");
}

onMount(() => {
	const handleThemeChange = () => requestAnimationFrame(syncThemeState);
	const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
	window.addEventListener("theme-change", handleThemeChange);
	document.addEventListener("astro:page-load", handleThemeChange);
	systemThemeQuery.addEventListener("change", handleThemeChange);
	handleThemeChange();

	return () => {
		window.removeEventListener("theme-change", handleThemeChange);
		document.removeEventListener("astro:page-load", handleThemeChange);
		systemThemeQuery.removeEventListener("change", handleThemeChange);
	};
});
</script>

<div class="relative z-50">
    <button aria-label="Light/Dark Mode" class="relative btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90" id="scheme-switch" onclick={toggleScheme}>
        <div class="absolute" class:opacity-0={isDark}>
            <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute" class:opacity-0={!isDark}>
            <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
    </button>
</div>
