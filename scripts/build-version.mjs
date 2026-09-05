import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export default function buildVersion() {
  const version = { id: randomUUID(), builtAt: new Date().toISOString() };
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
