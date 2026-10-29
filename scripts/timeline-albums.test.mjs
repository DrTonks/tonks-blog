import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTimelineAlbums } from '../src/utils/timeline-albums.ts';

const event = { id: 'trip', type: 'album', albumId: 'journey', title: '独立经历标题', description: '独立经历描述', startDate: '2026-08-20' };
const album = { id: 'journey', title: '相册标题', description: '相册简介', cover: '/cover.jpg', date: '2026-10-01', photos: [{ src: '/private-large.jpg' }] };

test('album references preserve event copy and dates, exposing only sticker metadata', () => {
  const [result] = resolveTimelineAlbums([event], [album], true);
  assert.deepEqual(result, { ...event, album: { href: '/albums/journey/', cover: '/cover.jpg', title: '相册标题' } });
  assert.equal(result.image, undefined);
  assert.equal(event.album, undefined);
  assert.ok(!JSON.stringify(result).includes('private-large'));
});
test('missing or hidden albums and disabled album pages fail before publishing dead links', () => {
  assert.throws(() => resolveTimelineAlbums([event], [], true), /trip.*journey.*missing/);
  assert.throws(() => resolveTimelineAlbums([event], [album], false), /disabled/);
  assert.throws(() => resolveTimelineAlbums([event], [{ ...album, cover: '' }], true), /invalid/);
});
test('existing events are unchanged and multiple experiences can share an album', () => {
  const work = { id: 'work', type: 'work', startDate: '2024-01-01', image: ['/work.jpg'] };
  assert.equal(resolveTimelineAlbums([work], [], false)[0], work);
  assert.equal(resolveTimelineAlbums([event, { ...event, id: 'trip2' }], [album], true).length, 2);
});

test('every regular event type can attach a sticker without changing content, icons or galleries', () => {
  for (const type of ['education', 'work', 'project', 'achievement', 'love']) {
    const original = { ...event, type, icon: 'material-symbols:emoji-events', image: ['/award.jpg'], achievements: ['Award'] };
    const [result] = resolveTimelineAlbums([original], [album], true);
    const { album: sticker, ...rest } = result;
    assert.deepEqual(rest, original);
    assert.equal(sticker.href, '/albums/journey/');
    assert.throws(() => resolveTimelineAlbums([original], [], true), /missing/);
  }
});
