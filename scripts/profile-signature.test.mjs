import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/utils/profile-signature.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function setup({ loading = false, reduced = false } = {}) {
  const observers = [], images = [], animations = [];
  const document = new EventTarget();
  document.visibilityState = 'visible';
  document.getElementById = () => loading ? { dataset: {} } : null;
  const window = new EventTarget();
  class Element {
    dataset = { frames: '/frames.webp', still: '/still.webp' };
    style = { setProperty() {}, removeProperty() {} };
    querySelector() {
      return { animate() {
        const done = deferred();
        const animation = {
          finished: done.promise, playState: 'running',
          play() { this.playState = 'running'; },
          pause() { this.playState = 'paused'; },
          cancel() { this.playState = 'idle'; done.reject(new Error('cancelled')); },
          finish() { done.resolve(); },
        };
        animations.push(animation);
        return animation;
      } };
    }
  }
  const exports = {};
  vm.runInNewContext(code, {
    exports, HTMLElement: Element, document, window, AbortController,
    matchMedia: () => ({ matches: reduced }),
    Image: class { constructor() { const pending = deferred(); this.decode = () => pending.promise; images.push(pending); } },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  });
  const Signature = exports.createProfileSignature([70, 60, 70]);
  const element = new Signature();
  element.connectedCallback();
  return {
    element, Signature, animations, images, observers,
    intersect(ratio) { observers.at(-1).callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]); },
    decode() { images.forEach(image => image.resolve()); },
    visibility(value) { document.visibilityState = value; document.dispatchEvent(new Event('visibilitychange')); },
    ready() { window.dispatchEvent(new Event('tonks:initial-loader:done')); },
  };
}

test('waits for loader and at least half of the signature to be visible', async () => {
  const env = setup({ loading: true });
  assert.equal(env.observers.length, 0);
  env.ready();
  env.intersect(0.1);
  assert.equal(env.images.length, 0);
  env.intersect(0.8);
  env.decode(); await flush();
  assert.equal(env.animations.length, 1);
  assert.equal(env.element.dataset.state, 'playing');
});

test('does not consume entrance when decoding finishes offscreen', async () => {
  const env = setup();
  env.intersect(1); env.intersect(0); env.decode(); await flush();
  assert.equal(env.animations.length, 0);
  env.intersect(1); env.decode(); await flush();
  assert.equal(env.animations.length, 1);
});

test('pauses offscreen and in a background tab; resumes without restarting', async () => {
  const env = setup();
  env.intersect(1); env.decode(); await flush();
  env.visibility('hidden');
  assert.equal(env.animations[0].playState, 'paused');
  env.visibility('visible');
  assert.equal(env.animations[0].playState, 'running');
  env.intersect(0);
  assert.equal(env.animations[0].playState, 'paused');
  env.intersect(1);
  assert.equal(env.animations.length, 1);
  assert.equal(env.animations[0].playState, 'running');
});

test('interrupted entrance retries after Swup reconnect; completed entrance does not replay', async () => {
  const env = setup();
  env.intersect(1); env.decode(); await flush();
  env.element.disconnectedCallback();
  env.element.connectedCallback();
  env.intersect(1); env.decode(); await flush();
  assert.equal(env.animations.length, 2);
  assert.equal(env.element.dataset.state, 'playing');
  env.animations[1].finish(); await flush();
  assert.equal(env.element.dataset.state, 'complete');
  env.element.disconnectedCallback(); env.element.connectedCallback();
  const next = new env.Signature(); next.connectedCallback();
  assert.equal(next.dataset.state, 'complete');
  assert.equal(env.observers.length, 2);
});

test('old decode cannot start animation or reset state after reconnection', async () => {
  const env = setup();
  env.intersect(1);
  const oldImages = [...env.images];
  env.element.disconnectedCallback(); env.element.connectedCallback();
  env.intersect(1);
  oldImages.forEach(image => image.resolve()); await flush();
  assert.equal(env.animations.length, 0);
  env.decode(); await flush();
  assert.equal(env.animations.length, 1);
});

test('reduced motion and failed assets retain static readable signature', async () => {
  const reduced = setup({ reduced: true });
  assert.equal(reduced.element.dataset.state, 'complete');
  assert.equal(reduced.observers.length, 0);
  const env = setup(); env.intersect(1);
  env.images[0].reject(new Error('missing asset')); await flush();
  assert.equal(env.element.dataset.state, 'complete');
  assert.equal(env.animations.length, 0);
  assert.equal(env.observers[0].disconnected, true);
});
