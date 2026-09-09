import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAvatarModules } from './theme-avatar-test-utils.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function setup({ stored, mobile = false, touchOnly = false, reduced = false, gpu = true, vt = true, systemDark = false, dark = false, shader = true, gpuError = 0 } = {}) {
  const timers = new Map(), idles = new Map(), frames = new Map();
  let id = 0, contexts = 0, buffers = 0, deletedBuffers = 0, lost = 0;
  const style = () => ({ viewTransitionName: '', removeProperty(name) {
    if (name === 'view-transition-name') this.viewTransitionName = '';
  } });
  const gl = new Proxy({
    createBuffer() { buffers++; return {}; },
    deleteBuffer(buffer) { if (buffer) deletedBuffers++; },
    createShader: () => ({}), createProgram: () => ({}), createTexture: () => ({}),
    getShaderParameter: () => shader, getProgramParameter: () => true,
    NO_ERROR: 0, getError: () => gpuError, isContextLost: () => false,
    getExtension: () => ({ loseContext() { lost++; } }),
  }, { get: (target, key) => key in target ? target[key] : () => ({}) });
  class Canvas extends EventTarget {
    width = 0; height = 0;
    getContext(type) { if (type === 'webgl') { contexts++; return gpu ? gl : null; } return { drawImage() {} }; }
    cloneNode() { return new Canvas(); }
    replaceWith(next) { avatar.canvas = next; }
  }
  class Element extends EventTarget {
    isConnected = true; dataset = {}; style = style(); canvas = new Canvas();
    images = [0, 1].map(() => ({ decode: async () => {}, naturalWidth: 512, naturalHeight: 512 }));
    querySelectorAll() { return this.images; }
    querySelector() { return this.canvas; }
    closest() { return this; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 256, bottom: 256, width: 256, height: 256 }; }
  }
  const media = new Map();
  function matchMedia(query) {
    if (!media.has(query)) {
      const item = new EventTarget();
      item.matches = query.includes('767') ? mobile || (query.includes('(hover: none) and (pointer: coarse)') && touchOnly)
        : query.includes('reduced') ? reduced : systemDark;
      media.set(query, item);
    }
    return media.get(query);
  }
  const window = new EventTarget();
  Object.assign(window, {
    matchMedia, location: { hostname: 'localhost' },
    setTimeout(fn) { timers.set(++id, fn); return id; },
    requestIdleCallback(fn) { idles.set(++id, fn); return id; },
    cancelIdleCallback(key) { idles.delete(key); },
  });
  const entries = new Map(stored === undefined ? [] : [['avatarParticlesEnabled', stored]]);
  const localStorage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const classes = new Set(dark ? ['dark'] : []);
  const animations = [];
  const root = { dataset: { theme: dark ? 'github-dark' : 'github-light' }, classList: {
    contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key),
    toggle(key, enabled) { enabled ? classes.add(key) : classes.delete(key); },
  }, animate(keyframes, options) {
    const animation = { keyframes, options, cancel() { this.cancelled = true; } };
    animations.push(animation); return animation;
  } };
  const document = new EventTarget();
  let transition;
  Object.assign(document, {
    hidden: false, cookie: '', documentElement: root, timeline: { currentTime: 1 },
    querySelector: () => avatar, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => new Canvas(),
    ...(vt ? { startViewTransition(update) {
      transition = { ready: deferred(), finished: deferred(), update };
      return { ready: transition.ready.promise, finished: transition.finished.promise,
        skipTransition() { transition.skipped = true; } };
    } } : {}),
  });
  const modules = loadAvatarModules({
    HTMLElement: Element, window, document, localStorage, Event, CustomEvent,
    matchMedia, innerWidth: mobile ? 767 : 1280, innerHeight: 900, devicePixelRatio: 1,
    performance: { now: () => 1 },
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key) { frames.delete(key); },
    setTimeout: window.setTimeout, clearTimeout(key) { timers.delete(key); },
  });
  const avatar = new modules.ThemeAvatarElement();
  return {
    ...modules, avatar, window, document, localStorage, entries, animations, frames,
    get transition() { return transition; },
    get counts() { return { contexts, buffers, deletedBuffers, lost }; },
    get pending() { return timers.size + idles.size; },
    async prepare() {
      for (const [key, fn] of [...timers]) { timers.delete(key); fn(); }
      for (const [key, fn] of [...idles]) { idles.delete(key); fn(); }
      await flush();
    },
    media(query, matches) { const item = matchMedia(query); item.matches = matches; item.dispatchEvent(new Event('change')); },
    storage(value, key = 'avatarParticlesEnabled', area = localStorage) {
      if (key === null) entries.clear();
      else if (value === null) entries.delete(key);
      else entries.set(key, value);
      const event = new Event('storage'); Object.assign(event, { key, storageArea: area }); window.dispatchEvent(event);
    },
  };
}

test('explicit off, mobile, reduced motion and missing VT allocate no GPU', async () => {
  for (const options of [{ stored: 'false' }, { mobile: true }, { stored: 'true', mobile: true },
    { stored: 'true', touchOnly: true }, { stored: 'true', reduced: true }, { stored: 'true', vt: false }]) {
    const env = setup(options);
    env.avatar.connectedCallback();
    await env.prepare();
    assert.equal(env.counts.contexts, 0);
    assert.equal(env.pending, 0);
    assert.equal(env.avatar.begin(true, 0, 0, 1400, 560), null);
    assert.equal(env.avatar.style.viewTransitionName, '');
  }
});

test('opt in persists; disable releases resources and re-enable uses a fresh canvas', async () => {
  const env = setup({ stored: 'false' });
  env.avatar.connectedCallback();
  env.setAvatarParticlesEnabled(true);
  assert.equal(env.entries.get('avatarParticlesEnabled'), 'true');
  await env.prepare();
  assert.equal(env.counts.buffers, 1);
  const oldCanvas = env.avatar.canvas;
  const run = env.avatar.begin(true, 0, 0, 1400, 560);
  run.capture(); run.start(0);
  env.setAvatarParticlesEnabled(false);
  await run.done;
  assert.equal(env.frames.size, 0);
  assert.equal(env.avatar.dataset.state, 'static');
  assert.equal(env.avatar.style.viewTransitionName, '');
  assert.equal(env.avatar.dataset.particleBytes, undefined);
  assert.equal(env.avatar.canvas.width, 0);
  assert.notEqual(env.avatar.canvas, oldCanvas);
  assert.equal(env.counts.deletedBuffers, 1);
  assert.equal(env.counts.lost, 1);
  env.setAvatarParticlesEnabled(true);
  await env.prepare();
  assert.equal(env.counts.buffers, 2);
  // Late callbacks from an old run cannot capture or cancel a new one.
  const next = env.avatar.begin(false, 0, 0, 1400, 560);
  next.capture(); run.capture(); run.start(0); run.cancel();
  assert.equal(env.avatar.dataset.state, 'particles');
  next.cancel();
});

test('767 boundary and live reduced-motion release buffers without erasing preference', async () => {
  const env = setup({ stored: 'true' });
  env.avatar.connectedCallback(); await env.prepare();
  for (const query of [env.AVATAR_MOBILE_QUERY, env.REDUCED_MOTION_QUERY]) {
    env.media(query, true); await env.prepare();
    assert.equal(env.counts.buffers, env.counts.deletedBuffers);
    assert.equal(env.avatar.gl, null);
    assert.equal(env.getAvatarParticlesEnabled(), true);
    env.media(query, false); await env.prepare();
    assert.equal(env.counts.buffers - env.counts.deletedBuffers, 1);
  }
});

test('disable before idle or during decode never creates WebGL', async () => {
  const env = setup({ stored: 'true' });
  env.avatar.connectedCallback(); env.setAvatarParticlesEnabled(false);
  await env.prepare(); assert.equal(env.counts.contexts, 0);
  const decode = deferred(); env.avatar.images[0].decode = () => decode.promise;
  env.setAvatarParticlesEnabled(true); await env.prepare();
  env.media(env.AVATAR_MOBILE_QUERY, true);
  decode.resolve(); await flush();
  assert.equal(env.counts.contexts, 0);
});

test('stale decode success/rejection cannot create or dispose a newer generation', async () => {
  for (const reject of [false, true]) {
    const env = setup({ stored: 'true' });
    const decode = deferred(); env.avatar.images[0].decode = () => decode.promise;
    env.avatar.connectedCallback(); await env.prepare();
    env.setAvatarParticlesEnabled(false);
    env.avatar.images[0].decode = async () => {};
    env.setAvatarParticlesEnabled(true); await env.prepare();
    reject ? decode.reject(new Error('stale')) : decode.resolve(); await flush();
    assert.equal(env.counts.contexts, 1);
    assert.equal(env.counts.deletedBuffers, 0);
    assert.equal(env.avatar.dataset.gpuReady, 'true');
  }
});

test('storage set/remove/clear restores the default-on policy; unrelated storage is ignored', async () => {
  const env = setup({ stored: 'false' }); env.avatar.connectedCallback();
  env.storage('true'); await env.prepare(); assert.equal(env.counts.buffers, 1);
  env.storage('false', 'unrelated'); assert.equal(env.counts.deletedBuffers, 0);
  env.storage('false', 'avatarParticlesEnabled', {}); assert.equal(env.counts.deletedBuffers, 0);
  env.storage(null); await env.prepare(); assert.equal(env.counts.deletedBuffers, 0);
  env.storage('false'); assert.equal(env.counts.deletedBuffers, 1);
  env.storage(null, null); await env.prepare(); assert.equal(env.counts.buffers, 2);
  assert.equal(env.getAvatarParticlesEnabled(), true);
});

test('blocked storage still permits a tab-local preference', async () => {
  const env = setup(); env.avatar.connectedCallback();
  env.localStorage.getItem = () => { throw new Error('blocked'); };
  env.localStorage.setItem = () => { throw new Error('blocked'); };
  assert.equal(env.getAvatarParticlesEnabled(), true);
  env.setAvatarParticlesEnabled(true); await env.prepare();
  assert.equal(env.getAvatarParticlesEnabled(), true);
  assert.equal(env.counts.buffers, 1);
  env.setAvatarParticlesEnabled(false); assert.equal(env.counts.deletedBuffers, 1);
});

test('disconnect removes subscriptions; context loss disables this session without leaking buffers', async () => {
  const env = setup({ stored: 'true' }); env.avatar.connectedCallback(); await env.prepare();
  env.avatar.isConnected = false; env.avatar.disconnectedCallback();
  env.setAvatarParticlesEnabled(false); env.setAvatarParticlesEnabled(true);
  assert.equal(env.pending, 0);
  env.avatar.isConnected = true; env.avatar.connectedCallback(); await env.prepare();
  const staleCanvas = env.avatar.canvas;
  staleCanvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(env.counts.deletedBuffers, 2);
  env.setAvatarParticlesEnabled(false); env.setAvatarParticlesEnabled(true); await env.prepare();
  staleCanvas.dispatchEvent(new Event('webglcontextlost'));
  assert.equal(env.counts.deletedBuffers, 2);
  assert.equal(env.counts.buffers, 2);
  assert.equal(env.isAvatarParticlesSupported(), false);
  assert.equal(env.canUseAvatarParticles(), false);
});

test('disabled and unavailable avatars keep a single root clip and lock until VT finishes', async () => {
  for (const options of [{ stored: 'false' }, { stored: 'true', gpu: false }, { stored: 'true', mobile: true }, { stored: 'true', touchOnly: true }]) {
    const env = setup(options); env.avatar.connectedCallback(); await env.prepare();
    assert.equal(env.setThemeFromPoint('dark', 5, 5), true);
    env.transition.update(); env.transition.ready.resolve(); await flush();
    assert.equal(env.avatar.style.viewTransitionName, '');
    assert.deepEqual(env.animations.map(a => a.options.pseudoElement), ['::view-transition-new(root)']);
    assert.equal(env.setThemeFromPoint('light', 5, 5), false);
    env.transition.finished.resolve(); await flush();
    assert.equal(env.setThemeFromPoint('light', 5, 5), true);
    env.transition.update(); env.transition.ready.reject(new Error('skip'));
    env.transition.finished.resolve(); await flush();
  }
});

test('cancelling particles before capture or after ready never unlocks an unfinished VT', async () => {
  for (const beforeCapture of [true, false]) {
    const env = setup({ stored: 'true' }); env.avatar.connectedCallback(); await env.prepare();
    env.setThemeFromPoint('dark', 5, 5);
    if (beforeCapture) env.setAvatarParticlesEnabled(false);
    env.transition.update(); env.transition.ready.resolve(); await flush();
    if (!beforeCapture) env.setAvatarParticlesEnabled(false);
    assert.equal(env.setThemeFromPoint('light', 5, 5), false);
    env.transition.finished.resolve(); await flush();
    assert.equal(env.setThemeFromPoint('light', 5, 5), true);
    env.transition.update(); env.transition.ready.reject(new Error('skip'));
    env.transition.finished.resolve(); await flush();
  }
});

test('reduce before ready or mid-reveal skips all motion but holds ownership until finished', async () => {
  for (const beforeReady of [true, false]) {
    const env = setup({ stored: 'true' }); env.avatar.connectedCallback(); await env.prepare();
    env.setThemeFromPoint('dark', 5, 5);
    if (beforeReady) env.media(env.REDUCED_MOTION_QUERY, true);
    env.transition.update(); env.transition.ready.resolve(); await flush();
    if (!beforeReady) env.media(env.REDUCED_MOTION_QUERY, true);
    assert.equal(env.transition.skipped, true);
    assert.ok(env.animations.every(animation => animation.cancelled));
    assert.equal(env.counts.deletedBuffers, 1);
    assert.equal(env.avatar.dataset.state, 'static');
    assert.equal(env.setThemeFromPoint('light', 5, 5), false);
    env.transition.finished.resolve(); await flush();
    assert.equal(env.setThemeFromPoint('light', 5, 5), true);
    assert.equal(env.document.documentElement.classList.contains('dark'), false);
  }
});


test('absent or invalid preference enables a supported desktop using exactly one render context', async () => {
  for (const stored of [undefined, 'invalid', 'true']) {
    const env = setup({ stored });
    assert.equal(env.getAvatarParticlesEnabled(), true);
    assert.equal(env.isAvatarParticlesSupported(), true);
    assert.equal(env.counts.contexts, 0); // Reading policy never probes the GPU.
    env.avatar.connectedCallback(); await env.prepare();
    assert.equal(env.counts.contexts, 1);
    assert.equal(env.avatar.dataset.gpuReady, 'true');
    assert.equal(env.entries.get('avatarParticlesEnabled'), stored);
  }
});

test('missing VT and real GPU failures report UI-unavailable without saving false or retry loops', async () => {
  for (const options of [{ vt: false }, { gpu: false }, { shader: false }, { gpuError: 1285 }]) {
    const env = setup(options);
    let changes = 0;
    env.window.addEventListener(env.AVATAR_PARTICLES_CHANGE, () => changes++);
    env.avatar.connectedCallback(); await env.prepare();
    assert.equal(env.isAvatarParticlesSupported(), false);
    assert.equal(env.canUseAvatarParticles(), false);
    assert.equal(env.entries.get('avatarParticlesEnabled'), undefined);
    assert.equal(env.counts.contexts, options.vt === false ? 0 : 1);
    assert.equal(env.counts.deletedBuffers, env.counts.buffers);
    assert.equal(env.avatar.gl, null);
    assert.equal(env.pending, 0);
    if (options.vt !== false) assert.ok(changes > 0);
    env.setAvatarParticlesEnabled(true); await env.prepare();
    assert.equal(env.counts.contexts, options.vt === false ? 0 : 1);
  }
});

test('equal resolved themes persist manual/system choices without VT, particles, RAF or a new lock', async () => {
  for (const dark of [false, true]) {
    const env = setup({ dark, systemDark: dark });
    env.avatar.connectedCallback(); await env.prepare();
    const mode = dark ? 'dark' : 'light';
    for (const next of ['system', mode, 'system']) {
      assert.equal(env.setThemeFromPoint(next, 5, 5), true);
      assert.equal(env.entries.get('theme'), next);
      assert.match(env.document.cookie, new RegExp(`tonks_theme=${next};`));
      assert.equal(env.transition, undefined);
      assert.equal(env.frames.size, 0);
      assert.equal(env.animations.length, 0);
      assert.equal(env.avatar.style.viewTransitionName, '');
      assert.equal(env.document.documentElement.classList.contains('is-theme-revealing'), false);
    }
    // Returning to system really resumes following, without an empty transition.
    env.media('(prefers-color-scheme: dark)', !dark);
    assert.equal(env.document.documentElement.classList.contains('dark'), !dark);
    env.setThemeFromPoint(dark ? 'light' : 'dark', 5, 5);
    env.media('(prefers-color-scheme: dark)', dark);
    assert.equal(env.document.documentElement.classList.contains('dark'), !dark);
    // An actual color change immediately afterwards still acquires the reveal.
    assert.equal(env.setThemeFromPoint(mode, 5, 5), true);
    assert.ok(env.transition);
    env.transition.update(); env.transition.ready.reject(new Error('skip'));
    env.transition.finished.resolve(); await flush();
  }
});
