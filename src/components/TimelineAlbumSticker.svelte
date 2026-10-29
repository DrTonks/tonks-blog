<script lang="ts">
  import { optimizedImage } from '../utils/optimized-image';
  export let album: { href: string; cover: string; title: string };
  export let compact = false;
</script>

<a class="album-sticker" class:compact href={album.href} aria-label={`纪念留影：${album.title}`}>
  <span class="album-sticker__clip" aria-hidden="true"></span>
  <img src={optimizedImage(album.cover, 'display')} alt="" loading="lazy" decoding="async" width="240" height="180" />
  <span class="album-sticker__caption"><span>纪念留影</span><span aria-hidden="true">↗</span></span>
</a>

<style>
  .album-sticker {
    position: relative; display: block; width: 8.75rem; max-width: calc(100% - .7rem); box-sizing: border-box;
    padding: .6rem .6rem .75rem; margin: .75rem .35rem .4rem;
    color: var(--text-accent, var(--primary)); text-decoration: none;
    background: #faf7ed; border: 1px solid color-mix(in srgb, var(--primary) 22%, #d6d0c2);
    box-shadow: .3rem .4rem 0 color-mix(in srgb, var(--primary) 9%, transparent), 0 .4rem 1rem #0002;
    transform: rotate(4deg); transform-origin: 50% 20%;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }
  :global(.dark) .album-sticker { background: #2c3035; border-color: color-mix(in srgb, var(--primary) 30%, #444); }
  .album-sticker img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border: 1px solid #80808033; }
  .album-sticker__caption { display: flex; justify-content: space-between; align-items: center; padding: .65rem .2rem 0; font: 600 .8rem/1.4 system-ui, sans-serif; }
  .album-sticker__clip { position: absolute; width: .65rem; height: 1.7rem; top: -.7rem; left: 1rem; border: 2px solid #92999e; border-radius: .5rem; transform: rotate(-12deg); box-shadow: 1px 1px 1px #0002; }
  .album-sticker.compact { display: flex; align-items: center; gap: .5rem; width: 11rem; padding: .5rem; transform: rotate(2deg); }
  .album-sticker.compact img { width: 3.5rem; flex: 0 0 3.5rem; }
  .album-sticker.compact .album-sticker__caption { flex: 1; gap: .5rem; padding: 0; }
  .album-sticker:focus-visible { outline: 2px solid var(--primary); outline-offset: 5px; transform: rotate(0) translateY(-3px); }
  @media (hover: hover) { .album-sticker:hover { transform: rotate(0) translateY(-4px); box-shadow: .2rem .5rem 0 color-mix(in srgb, var(--primary) 12%, transparent), 0 .65rem 1.25rem #0003; } }
  .album-sticker:active { transform: rotate(0) translateY(0); }
  @container (max-width: 31.999rem) {
    .album-sticker { display: flex; align-items: center; gap: .7rem; width: 13rem; padding: .45rem .6rem; margin-top: .35rem; transform: rotate(2deg); }
    .album-sticker img { width: clamp(3rem, 18cqi, 4.75rem); flex: 0 0 clamp(3rem, 18cqi, 4.75rem); }
    .album-sticker__caption { flex: 1; gap: .5rem; padding: 0; }
  }
  @media (prefers-reduced-motion: reduce) { .album-sticker { transition: none; } .album-sticker, .album-sticker.compact, .album-sticker:hover, .album-sticker:focus-visible, .album-sticker:active { transform: none; } }
</style>
