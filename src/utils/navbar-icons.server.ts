import type { IconifyIcon } from '@iconify/svelte/dist/OfflineIcon.svelte';
import { findLocalIcon } from './local-icons.server.mjs';
import compatibility from './navbar-icon-compat.json';

// Apache-2.0, Google Material Symbols (via Iconify). These six SVG variants
// preserve the deployed shapes across the migration to the locked local set.
function resolveGroup<T extends Record<string, string>>(names: T) {
  return Object.fromEntries(Object.entries(names).map(([key, name]) => {
    const body = (compatibility as Record<string, string>)[name];
    const data = body ? { body, width: 24, height: 24 } : findLocalIcon(`material-symbols:${name}`);
    if (!data) throw new Error(`Unknown navbar icon: ${name}`);
    return [key, data];
  })) as Record<keyof T, IconifyIcon>;
}

export const navbarIcons = {
  search: resolveGroup({
    search: 'search',
    closeRounded: 'close-rounded',
  }),
  theme: resolveGroup({
    lightModeOutlineRounded: 'light-mode-outline-rounded',
    darkModeOutlineRounded: 'dark-mode-outline-rounded',
    contrastRounded: 'contrast-rounded',
    wbSunnyOutlineRounded: 'wb-sunny-outline-rounded',
    checkRounded: 'check-rounded',
  }),
  toc: resolveGroup({
    formatListBulleted: 'format-list-bulleted',
    close: 'close',
    articleOutline: 'article-outline',
  }),
  settings: resolveGroup({
    lightModeOutlineRounded: 'light-mode-outline-rounded',
    checkRounded: 'check-rounded',
    darkModeOutlineRounded: 'dark-mode-outline-rounded',
    wallpaperOutlineRounded: 'wallpaper-outline-rounded',
    wavesRounded: 'waves-rounded',
    blurOnRounded: 'blur-on-rounded',
    gridViewOutlineRounded: 'grid-view-outline-rounded',
  }),
};

export type NavbarIcons = typeof navbarIcons;
