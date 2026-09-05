import { writeFile } from 'node:fs/promises';
import { readSiteVersion } from './version-state.mjs';

export default function buildVersion() {
  const id = process.env.TONKS_BUILD_ID || readSiteVersion(new URL('../site-version.json', import.meta.url));
  const version = { id, builtAt: new Date().toISOString() };
  return {
    name: 'tonks-build-version',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => updateConfig({ vite: { define: {
        'import.meta.env.PUBLIC_BUILD_ID': JSON.stringify(version.id),
      } } }),
      'astro:build:done': async ({ dir }) => {
        await writeFile(new URL('version.json', dir), JSON.stringify(version) + '\n');
      },
    },
  };
}
