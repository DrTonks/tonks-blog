import { icons } from '@iconify-json/material-symbols';
import { addCollection, getIcon } from '@iconify/svelte/dist/functions.js';
import type { TimelineItem } from '../data/timeline';
import { getTypeIcon } from './timeline-icon-name';

// Build-time only: Iconify resolves aliases (e.g. emoji-events → trophy) locally.
// Only the icons referenced by the page are serialized into the client props.
addCollection(icons);

export function resolveTimelineIcons(items: TimelineItem[]) {
  return Object.fromEntries(items.map(item => {
    const name = item.icon || getTypeIcon(item.type);
    const icon = getIcon(name) || getIcon(getTypeIcon(item.type));
    if (!icon) throw new Error(`Missing timeline icon: ${name}`);
    return [name, icon];
  }));
}
