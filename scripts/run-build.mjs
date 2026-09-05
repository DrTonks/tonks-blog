import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readSiteVersion, selectVersion, parseBuildArguments } from './version-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const stateFile = resolve(root, 'site-version.json');
try {
  const { bump, deploy } = parseBuildArguments(process.argv.slice(2));
  const original = readFileSync(stateFile, 'utf8');
  const current = readSiteVersion(stateFile);
  const id = selectVersion(current, bump);
  const env = { ...process.env, TONKS_BUILD_ID: id };
  const run = (file, args = []) => {
    const result = spawnSync(process.execPath, [resolve(root, file), ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${file} failed (${result.status ?? result.signal})`);
  };
  console.log(`[version] ${bump ? 'Upgrade requested' : 'Keeping existing version'}: ${id}`);
  run('node_modules/astro/astro.js', ['build']);
  run('scripts/run-font-subset.js');
  run('node_modules/pagefind/lib/runner/bin.cjs', ['--site', 'dist']);
  if (bump) {
    if (readFileSync(stateFile, 'utf8') !== original) throw new Error('Version file changed during build. Refusing to overwrite another build.');
    const temporary = `${stateFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ id }, null, 2) + '\n');
    renameSync(temporary, stateFile);
    console.log('[version] Saved site-version.json. Include it in your next commit.');
  }
  if (deploy) run('scripts/deploy.js');
} catch (error) {
  console.error('[build]', error.message);
  process.exitCode = 1;
}
