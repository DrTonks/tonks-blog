<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import { DARK_MODE, LIGHT_MODE } from "@constants/constants";
import type { AccentPreset } from "@/types/config";
import {
	getAccent,
	getWavesEnabled,
	setAccent,
	setThemeFromPoint,
	setWavesEnabled,
} from "@utils/setting-utils";

const accentPresets: { id: AccentPreset; label: string }[] = [
	{ id: "blue", label: "蓝色" },
	{ id: "gold", label: "金色" },
];

let lightAccent = getAccent("light");
let darkAccent = getAccent("dark");
let wavesEnabled = getWavesEnabled();
let activeThemeMode: "light" | "dark" = document.documentElement.classList.contains("dark") ? "dark" : "light";

function chooseAccent(mode: "light" | "dark", preset: AccentPreset) {
	if (mode === "light") {
		lightAccent = preset;
	} else {
		darkAccent = preset;
	}
	setAccent(mode, preset);
}

function toggleWaves() {
	wavesEnabled = !wavesEnabled;
	setWavesEnabled(wavesEnabled);
}

function syncThemeMode() {
	activeThemeMode = document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyThemeMode(mode: "light" | "dark", x: number, y: number) {
	const theme = mode === "dark" ? DARK_MODE : LIGHT_MODE;
	if (mode === activeThemeMode && localStorage.getItem("theme") === theme) return;
	setThemeFromPoint(theme, x, y);
	activeThemeMode = mode;
}

function chooseThemeMode(mode: "light" | "dark", event: MouseEvent) {
	if ((event.target as HTMLElement).closest("button")) return;
	applyThemeMode(mode, event.clientX, event.clientY);
}

function handleThemeModeKeydown(mode: "light" | "dark", event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	applyThemeMode(mode, innerWidth / 2, innerHeight / 2);
}

onMount(() => {
	const handleThemeChange = () => requestAnimationFrame(syncThemeMode);
	window.addEventListener("theme-change", handleThemeChange);
	document.addEventListener("astro:page-load", handleThemeChange);
	handleThemeChange();
	return () => {
		window.removeEventListener("theme-change", handleThemeChange);
		document.removeEventListener("astro:page-load", handleThemeChange);
	};
});
</script>

<div id="display-setting" class="float-panel float-panel-closed absolute transition-all w-80 right-4 px-4 py-4">
    <div class="mb-3 flex flex-row items-center justify-between gap-2">
        <div class="relative ml-3 flex gap-2 text-lg font-bold text-neutral-900 transition dark:text-neutral-100
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            {i18n(I18nKey.themeColor)}
        </div>
        <span class="theme-color-hint">点击切换到对应主题</span>
    </div>

    <div class="accent-groups">
        <div
            class:active={activeThemeMode === "light"}
            class="accent-group"
            data-mode="light"
            role="button"
            tabindex="0"
            aria-pressed={activeThemeMode === "light"}
            aria-label="切换到亮色主题"
            on:click={(event) => chooseThemeMode("light", event)}
            on:keydown={(event) => handleThemeModeKeydown("light", event)}
        >
            <div class="accent-group__label">
                <Icon icon="material-symbols:light-mode-outline-rounded"></Icon>
                <span>亮色主题</span>
            </div>
            <div class="accent-options">
                {#each accentPresets as preset}
                    <button
                        type="button"
                        class:active={lightAccent === preset.id}
                        class="accent-option"
                        data-preset={preset.id}
                        aria-pressed={lightAccent === preset.id}
                        aria-label={`亮色主题：${preset.label}`}
                        on:click|stopPropagation={() => chooseAccent("light", preset.id)}
                        on:keydown|stopPropagation
                    >
                        <span class="accent-option__swatch" aria-hidden="true"></span>
                        <span>{preset.label}</span>
                        <span
                            class:visible={lightAccent === preset.id}
                            class="accent-option__check"
                            aria-hidden="true"
                        >
                            <Icon icon="material-symbols:check-rounded"></Icon>
                        </span>
                    </button>
                {/each}
            </div>
        </div>

        <div
            class:active={activeThemeMode === "dark"}
            class="accent-group"
            data-mode="dark"
            role="button"
            tabindex="0"
            aria-pressed={activeThemeMode === "dark"}
            aria-label="切换到暗色主题"
            on:click={(event) => chooseThemeMode("dark", event)}
            on:keydown={(event) => handleThemeModeKeydown("dark", event)}
        >
            <div class="accent-group__label">
                <Icon icon="material-symbols:dark-mode-outline-rounded"></Icon>
                <span>暗色主题</span>
            </div>
            <div class="accent-options">
                {#each accentPresets as preset}
                    <button
                        type="button"
                        class:active={darkAccent === preset.id}
                        class="accent-option"
                        data-preset={preset.id}
                        aria-pressed={darkAccent === preset.id}
                        aria-label={`暗色主题：${preset.label}`}
                        on:click|stopPropagation={() => chooseAccent("dark", preset.id)}
                        on:keydown|stopPropagation
                    >
                        <span class="accent-option__swatch" aria-hidden="true"></span>
                        <span>{preset.label}</span>
                        <span
                            class:visible={darkAccent === preset.id}
                            class="accent-option__check"
                            aria-hidden="true"
                        >
                            <Icon icon="material-symbols:check-rounded"></Icon>
                        </span>
                    </button>
                {/each}
            </div>
        </div>
    </div>

	<div class="my-4 h-px bg-black/10 dark:bg-white/10"></div>
	<div class="mb-2 ml-3 flex items-center gap-2 font-bold text-lg text-neutral-900 dark:text-neutral-100 relative
		before:absolute before:-left-3 before:top-[0.33rem] before:h-4 before:w-1 before:rounded-md before:bg-[var(--primary)]">
		<Icon icon="material-symbols:wallpaper-outline-rounded" class="text-[1.15rem]"></Icon>
		壁纸效果
	</div>
	<button
		type="button"
		role="switch"
		aria-checked={wavesEnabled}
		aria-label="水波纹动画"
		on:click={toggleWaves}
		class="wave-setting-row flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[var(--primary)] transition-colors hover:bg-[var(--btn-plain-bg-hover)]"
	>
		<span class="flex items-center gap-2 font-medium">
			<Icon icon="material-symbols:waves-rounded" class="text-[1.25rem]"></Icon>
			水波纹动画
		</span>
		<span class:enabled={wavesEnabled} class="wave-switch" aria-hidden="true"><span></span></span>
	</button>
</div>


<style lang="stylus">
    .accent-groups
      display grid
      gap 0.75rem

    .theme-color-hint
      color var(--content-meta)
      font-size 0.68rem
      font-weight 500
      letter-spacing 0.02em
      white-space nowrap

    .accent-group
      position relative
      padding 0.7rem
      border 1px solid var(--line-color)
      border-radius 0.85rem
      background var(--card-bg)
      cursor pointer
      transition border-color 160ms ease, box-shadow 220ms ease, background-color 220ms ease

      &:hover
        border-color var(--signal-line)

      &:focus-visible
        outline 2px solid var(--primary)
        outline-offset 2px

      &.active
        border-color var(--primary)
        background var(--signal-soft)
        box-shadow inset 0 0 0 1px var(--signal-soft), 0 0 1.1rem var(--signal-soft)

    .accent-group__label
      display flex
      align-items center
      gap 0.4rem
      margin-bottom 0.55rem
      color var(--content-meta)
      font-size 0.78rem
      font-weight 700

    .accent-options
      display grid
      grid-template-columns repeat(2, minmax(0, 1fr))
      gap 0.5rem

    .accent-option
      position relative
      display flex
      min-width 0
      min-height 2.65rem
      align-items center
      gap 0.5rem
      padding 0.4rem 0.55rem
      border 1px solid transparent
      border-radius 0.7rem
      color var(--content-meta)
      background var(--btn-plain-bg-hover)
      transition border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease, color 160ms ease

      &:hover
        color var(--btn-content)
        border-color var(--primary)

      &:focus-visible
        outline 2px solid var(--primary)
        outline-offset 2px

      &.active
        color var(--btn-content)
        border-color var(--primary)
        background var(--btn-regular-bg)
        box-shadow inset 0 0 0 1px var(--signal-soft), 0 0 1rem var(--signal-soft)

    .accent-option__swatch
      width 1.35rem
      height 1.35rem
      flex 0 0 auto
      border 1px solid rgba(255, 255, 255, 0.55)
      border-radius 0.45rem
      box-shadow 0 0.12rem 0.45rem rgba(15, 23, 42, 0.18)

    .accent-option__check
      margin-left auto
      opacity 0
      transform scale(0.7)
      transition opacity 160ms ease, transform 160ms ease

      &.visible
        opacity 1
        transform scale(1)

    .accent-group[data-mode="light"] .accent-option[data-preset="blue"] .accent-option__swatch
      background linear-gradient(135deg, #f2f8ff 12%, #68a8f7 100%)

    .accent-group[data-mode="light"] .accent-option[data-preset="gold"] .accent-option__swatch
      background linear-gradient(135deg, #ffffa8 8%, #efd52a 100%)

    .accent-group[data-mode="dark"] .accent-option[data-preset="blue"] .accent-option__swatch
      background linear-gradient(135deg, #101b2b 15%, #64c4ff 100%)

    .accent-group[data-mode="dark"] .accent-option[data-preset="gold"] .accent-option__swatch
      background linear-gradient(135deg, #28290c 12%, #ffe45a 100%)


    .wave-switch
      display inline-flex
      width 2.75rem
      height 1.5rem
      align-items center
      border-radius 999px
      padding 0.1875rem
      background var(--btn-regular-bg)
      transition background-color 180ms ease

      span
        width 1.125rem
        height 1.125rem
        border-radius 999px
        background var(--card-bg)
        box-shadow 0 1px 4px rgba(0, 0, 0, 0.18)
        transform translateX(0)
        transition transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)

      &.enabled
        background var(--primary)

        span
          transform translateX(1.25rem)

    @media (prefers-reduced-motion: reduce)
      .accent-option,
      .accent-option__check,
      .wave-switch,
      .wave-switch span
        transition none
</style>
