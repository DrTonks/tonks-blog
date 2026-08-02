<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { getDefaultHue, getHue, getWavesEnabled, setHue, setWavesEnabled } from "@utils/setting-utils";

let hue = getHue();
let wavesEnabled = getWavesEnabled();
const defaultHue = getDefaultHue();

function resetHue() {
	hue = getDefaultHue();
}

$: if (hue || hue === 0) {
	setHue(hue);
}

function toggleWaves() {
	wavesEnabled = !wavesEnabled;
	setWavesEnabled(wavesEnabled);
}
</script>

<div id="display-setting" class="float-panel float-panel-closed absolute transition-all w-80 right-4 px-4 py-4">
    <div class="flex flex-row gap-2 mb-3 items-center justify-between">
        <div class="flex gap-2 font-bold text-lg text-neutral-900 dark:text-neutral-100 transition relative ml-3
            before:w-1 before:h-4 before:rounded-md before:bg-[var(--primary)]
            before:absolute before:-left-3 before:top-[0.33rem]"
        >
            {i18n(I18nKey.themeColor)}
            <button aria-label="Reset to Default" class="btn-regular w-7 h-7 rounded-md  active:scale-90"
                    class:opacity-0={hue === defaultHue} class:pointer-events-none={hue === defaultHue} on:click={resetHue}>
                <div class="text-[var(--btn-content)]">
                    <Icon icon="fa6-solid:arrow-rotate-left" class="text-[0.875rem]"></Icon>
                </div>
            </button>
        </div>
        <div class="flex gap-1">
            <div id="hueValue" class="transition bg-[var(--btn-regular-bg)] w-10 h-7 rounded-md flex justify-center
            font-bold text-sm items-center text-[var(--btn-content)]">
                {hue}
            </div>
        </div>
    </div>
    <div class="w-full h-6 px-1 bg-[oklch(0.80_0.10_0)] dark:bg-[oklch(0.70_0.10_0)] rounded select-none">
        <input aria-label={i18n(I18nKey.themeColor)} type="range" min="0" max="360" bind:value={hue}
               class="slider" id="colorSlider" step="5" style="width: 100%">
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
    #display-setting
      input[type="range"]
        -webkit-appearance none
        height 1.5rem
        background-image var(--color-selection-bar)
        transition background-image 0.15s ease-in-out

        /* Input Thumb */
        &::-webkit-slider-thumb
          -webkit-appearance none
          height 1rem
          width 0.5rem
          border-radius 0.125rem
          background rgba(255, 255, 255, 0.7)
          box-shadow none
          &:hover
            background rgba(255, 255, 255, 0.8)
          &:active
            background rgba(255, 255, 255, 0.6)

        &::-moz-range-thumb
          -webkit-appearance none
          height 1rem
          width 0.5rem
          border-radius 0.125rem
          border-width 0
          background rgba(255, 255, 255, 0.7)
          box-shadow none
          &:hover
            background rgba(255, 255, 255, 0.8)
          &:active
            background rgba(255, 255, 255, 0.6)

        &::-ms-thumb
          -webkit-appearance none
          height 1rem
          width 0.5rem
          border-radius 0.125rem
          background rgba(255, 255, 255, 0.7)
          box-shadow none
          &:hover
            background rgba(255, 255, 255, 0.8)
          &:active
            background rgba(255, 255, 255, 0.6)


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
      .wave-switch,
      .wave-switch span
        transition none
</style>
