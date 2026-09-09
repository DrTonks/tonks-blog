import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
import ts from 'typescript';

test('uploaded WebP mappings retain existing local sources and failure fallback', async () => {
  const source = await readFile(new URL('../src/config/cdn.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const cdn = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const entries = Object.entries(cdn.getCdnMapping());
  assert.equal(entries.length, 11);
  for (const [local, remote] of entries) {
    assert.match(remote, /^https:\/\/img\.tonks\.top\/blog\/.+\.webp$/);
    await access(new URL('../public' + local, import.meta.url));
    assert.equal(cdn.getCdnUrl(local), remote);
    assert.equal(cdn.getLocalFallback(remote), local);
  }
  cdn.setCdnFailed(true);
  for (const [local] of entries) {
    assert.equal(cdn.getImageUrl(local), local);
    assert.equal(cdn.getCdnUrl(local), null);
  }
  cdn.setCdnFailed(false);
  assert.equal(cdn.getImageUrl('/images/new.png'), '/images/new.png');
});
