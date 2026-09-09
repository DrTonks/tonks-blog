import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAvatarModules } from './theme-avatar-test-utils.mjs';
const { revealArrival, revealProgress } = loadAvatarModules();

test('wave radius has exact clamped endpoints', () => {
  assert.equal(revealProgress(-1), 0);
  assert.equal(revealProgress(0), 0);
  assert.equal(revealProgress(1), 1);
  assert.equal(revealProgress(2), 1);
});

test('wave travels outward monotonically and matches reveal arrival', () => {
  let previousProgress = 0;
  for (let i = 0; i <= 1000; i++) {
    const fraction = i / 1000;
    const progress = revealProgress(fraction);
    assert.ok(progress >= previousProgress);
    previousProgress = progress;
    // Less than 0.1 CSS px mismatch even at a 4000px reveal radius.
    assert.ok(Math.abs(revealProgress(revealArrival(fraction)) - fraction) < 0.000025);
  }
});
