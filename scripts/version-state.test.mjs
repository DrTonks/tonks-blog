import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBuildArguments, selectVersion } from './version-state.mjs';

test('ordinary builds and deployment preserve the release id', () => {
  for (const args of [[], ['--deploy'], ['--']]) {
    const flags = parseBuildArguments(args);
    assert.equal(selectVersion('existing-release', flags.bump), 'existing-release');
  }
});
test('only an explicit bump flag changes the release id', () => {
  for (const args of [['--bump-version'], ['--deploy', '--', '--bump-version']]) {
    const id = selectVersion('existing-release', parseBuildArguments(args).bump);
    assert.notEqual(id, 'existing-release');
    assert.match(id, /^[0-9a-f-]{36}$/);
  }
});
test('unknown flags fail instead of silently triggering deployment', () => {
  assert.throws(() => parseBuildArguments(['--bump']));
  assert.equal(parseBuildArguments(['--bump-version']).deploy, false);
});
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('upgrade is persisted only after every build stage succeeds', () => {
  const root = mkdtempSync(join(tmpdir(), 'tonks-version-test-'));
  try {
    for (const folder of ['scripts', 'node_modules/astro', 'node_modules/pagefind/lib/runner']) mkdirSync(join(root, folder), { recursive: true });
    for (const file of ['run-build.mjs', 'version-state.mjs']) copyFileSync(new URL(file, import.meta.url), join(root, 'scripts', file));
    writeFileSync(join(root, 'site-version.json'), JSON.stringify({ id: 'original' }));
    writeFileSync(join(root, 'node_modules/astro/astro.js'), 'process.exit(0)');
    writeFileSync(join(root, 'scripts/run-font-subset.js'), 'process.exit(0)');
    const search = join(root, 'node_modules/pagefind/lib/runner/bin.cjs');
    writeFileSync(search, 'process.exit(1)');
    const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/run-build.mjs'), ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(run('--bump-version').status, 1);
    assert.equal(JSON.parse(readFileSync(join(root, 'site-version.json'))).id, 'original');
    writeFileSync(search, 'process.exit(0)');
    assert.equal(run('--bump-version').status, 0);
    const upgraded = JSON.parse(readFileSync(join(root, 'site-version.json'))).id;
    assert.notEqual(upgraded, 'original');
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(readFileSync(join(root, 'site-version.json'))).id, upgraded);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
