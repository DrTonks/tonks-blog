import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

export function readSiteVersion(file) {
  const version = JSON.parse(readFileSync(file, 'utf8'));
  if (typeof version.id !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(version.id)) throw new Error('site-version.json has an invalid id');
  return version.id;
}
export function selectVersion(current, bump = false) {
  return bump ? randomUUID() : current;
}
export function parseBuildArguments(args) {
  const flags = args.filter(arg => arg !== '--');
  for (const flag of flags) if (!['--bump-version', '--deploy'].includes(flag)) throw new Error(`Unknown build option: ${flag}`);
  return { bump: flags.includes('--bump-version'), deploy: flags.includes('--deploy') };
}
