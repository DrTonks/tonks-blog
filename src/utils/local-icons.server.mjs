import { createRequire } from 'node:module';
import { addCollection, getIcon } from '@iconify/svelte/dist/functions.js';

const require = createRequire(import.meta.url);
const collections = new Set(['material-symbols', 'mdi', 'fa6-brands', 'fa6-regular', 'fa6-solid', 'simple-icons']);
const loaded = new Set();

export function findLocalIcon(name) {
  const prefix = name.split(':', 1)[0];
  if (!collections.has(prefix)) return;
  if (!loaded.has(prefix)) {
    addCollection(require(`@iconify-json/${prefix}/icons.json`));
    loaded.add(prefix);
  }
  return getIcon(name);
}
