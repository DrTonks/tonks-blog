import type { TimelineItem, ResolvedTimelineItem } from '../data/timeline';
import type { AlbumGroup } from '../types/album';

// Build-time join: never serialize the album's photos or description to the timeline.
export function resolveTimelineAlbums(
  items: TimelineItem[],
  albums: Pick<AlbumGroup, 'id' | 'title' | 'cover'>[],
  enabled: boolean,
): ResolvedTimelineItem[] {
  const byId = new Map(albums.map(album => [album.id, album]));
  return items.map(item => {
    if (item.type !== 'album' && item.albumId === undefined) return item;
    if (!enabled) throw new Error(`Timeline ${item.id}: albums page is disabled`);
    const album = item.albumId ? byId.get(item.albumId) : undefined;
    if (!album?.cover) throw new Error(`Timeline ${item.id}: album ${item.albumId} is missing, hidden or invalid`);
    return { ...item, album: {
      href: `/albums/${encodeURIComponent(album.id)}/`, cover: album.cover, title: album.title,
    } };
  });
}
