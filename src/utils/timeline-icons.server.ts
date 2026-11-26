import { findLocalIcon } from './local-icons.server.mjs';
import type { TimelineItem } from '../data/timeline';
import { getTypeIcon } from './timeline-icon-name';

export function resolveTimelineIcons(items: TimelineItem[], strict: boolean) {
  return Object.fromEntries(items.map(item => {
    const fallback = getTypeIcon(item.type);
    const name = item.icon || fallback;
    let icon = findLocalIcon(name);
    if (!icon) {
      const message = `Timeline entry "${item.id}" has an unknown icon "${name}"`;
      if (strict) throw new Error(message);
      console.warn(message);
      icon = findLocalIcon(fallback);
    }
    return [name, icon];
  }));
}
