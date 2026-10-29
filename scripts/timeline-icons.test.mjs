import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as collection from '@iconify-json/material-symbols';
import * as iconify from '@iconify/svelte/dist/functions.js';
import * as names from '../src/utils/timeline-icon-name.ts';
import { timelineData } from '../src/data/timeline.ts';

const code = ts.transpileModule(readFileSync(new URL('../src/utils/timeline-icons.server.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const modules = {
  '@iconify-json/material-symbols': collection,
  '@iconify/svelte/dist/functions.js': iconify,
  './timeline-icon-name': names,
};
const exports = {};
vm.runInNewContext(code, { exports, require: name => {
  assert.ok(modules[name], `Unexpected dependency: ${name}`);
  return modules[name];
} });
const { resolveTimelineIcons } = exports;

test('every timeline node receives local icon data, including trophy aliases', () => {
  const icons = resolveTimelineIcons(timelineData);
  for (const item of timelineData) {
    const icon = icons[item.icon || names.getTypeIcon(item.type)];
    assert.ok(icon.body.includes('<path'));
    assert.equal(icon.width, 24);
    assert.equal(icon.height, 24);
  }
  assert.equal(icons['material-symbols:emoji-events'].body, collection.icons.icons.trophy.body);
  assert.equal(Object.keys(icons).length, new Set(timelineData.map(item => item.icon || names.getTypeIcon(item.type))).size);
  assert.ok(JSON.stringify(icons).length < 10000, 'Only the used icons should reach the client');
});

test('unknown custom icons and omitted icons fall back to a local type icon', () => {
  const icons = resolveTimelineIcons([
    { ...timelineData[0], icon: 'missing:unknown', type: 'achievement' },
    { ...timelineData[0], icon: undefined, type: 'love' },
    { ...timelineData[0], icon: undefined, type: 'album', albumId: 'journey' },
  ]);
  assert.equal(icons['missing:unknown'].body, collection.icons.icons.trophy.body);
  assert.equal(icons['material-symbols:favorite'].body, collection.icons.icons.favorite.body);
  assert.equal(icons['material-symbols:photo-library'].body, iconify.getIcon('material-symbols:photo-library').body);
});
