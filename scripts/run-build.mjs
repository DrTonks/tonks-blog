import { reportFriendAvatars } from './friend-avatars.mjs';
import {sourceFingerprint,sourceInventory,inventory,fingerprint} from './production-validation.mjs';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
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
  const run = (file, args = [], { retryWindowsAccessViolation = false } = {}) => {
    const attempts = retryWindowsAccessViolation && process.platform === 'win32' ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const started = performance.now();
      const result = spawnSync(process.execPath, [resolve(root, file), ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
      console.log(`[timing] ${file}: ${((performance.now() - started) / 1000).toFixed(2)}s`);
      if (result.error) throw result.error;
      // 0xC0000005 is a Windows native access violation. A clean second run still
      // performs every validation check; content failures and other exits never retry.
      if (result.status === 0) return;
      if (result.status === 0xC0000005 && attempt < attempts) {
        console.warn(`[build] ${file} hit a transient Windows access violation; retrying once.`);
        continue;
      }
      throw new Error(`${file} failed (${result.status ?? result.signal})`);
    }
  };
  console.log(`[version] ${bump ? 'Upgrade requested' : 'Keeping existing version'}: ${id}`);
  if (deploy) run('scripts/run-ai-summary.mjs');
  const buildInputs = sourceInventory(root);
  const buildSource = fingerprint(buildInputs);
  run('node_modules/astro/astro.js', ['build']);
  run('scripts/run-font-subset.js');
  run('node_modules/pagefind/lib/runner/bin.cjs', ['--site', 'dist']);
  if(sourceFingerprint(root)!==buildSource)throw new Error('Source changed during build. Rebuild the current source.');
  if (bump) {
    if (readFileSync(stateFile, 'utf8') !== original) throw new Error('Version file changed during build. Refusing to overwrite another build.');
    const temporary = `${stateFile}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ id }, null, 2) + '\n');
    renameSync(temporary, stateFile);
    const versionInput=buildInputs.find(f=>f.key==='site-version.json');
    versionInput.sha256=createHash('sha256').update(JSON.stringify({ id }, null, 2) + '\n').digest('hex');
    console.log('[version] Saved site-version.json. Include it in your next commit.');
  }
  const validatedSource=fingerprint(buildInputs);
  if(sourceFingerprint(root)!==validatedSource)throw new Error('Source changed before build completion. Rebuild.');
  mkdirSync(resolve(root,'.cache'),{recursive:true});
  writeFileSync(resolve(root,'.cache/build-provenance.json'),JSON.stringify({schema:1,source:validatedSource,artifacts:fingerprint(inventory(resolve(root,'dist'))),builtAt:new Date().toISOString()}));
  run('scripts/validate-production.mjs', [], { retryWindowsAccessViolation: true });
  await reportFriendAvatars(root);
  if (deploy) run('scripts/deploy.js');
} catch (error) {
  console.error('[build]', error.message);
  process.exitCode = 1;
}
