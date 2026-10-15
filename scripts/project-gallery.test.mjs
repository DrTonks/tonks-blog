import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDate, newestProjects, projectPlacements } from '../src/utils/project-gallery.ts';
import { projectsData } from '../src/data/projects.ts';

test('calendar dates normalize old unpadded entries and reject invalid days', () => {
  assert.equal(projectDate('2025-5-16').iso, '2025-05-16');
  assert.equal(projectDate('2025-5-16').label, '2025.05');
  assert.equal(projectDate('2025-02-29'), null);
  assert.equal(projectDate('2024-02-29').iso, '2024-02-29');
  assert.equal(projectDate(''), null);
});

test('newest-first order uses start dates without mutating project data', () => {
  const original = projectsData.map(p => p.id);
  assert.deepEqual(newestProjects(projectsData).map(p => p.id), [
    'deepseedian', 'career-planner-2026', 'tianchi-polardb-2025',
    'loan-risk-dashboard', 'calculator-app', 'loan-risk-Web',
    'tonks-home', 'carDetect', 'weiguang',
  ]);
  assert.deepEqual(projectsData.map(p => p.id), original);
  const missingDate = { ...projectsData[0], id: 'undated', startDate: '' };
  assert.equal(newestProjects([missingDate, ...projectsData]).at(-1).id, 'undated');
});

test('three columns place the newest three across the top then wrap left', () => {
  const positions = projectPlacements([310, 240, 390, 280, 190, 270], 3, 16);
  assert.deepEqual(positions.map(p => p.column), [1, 2, 3, 1, 2, 3]);
  assert.deepEqual(positions.map(p => p.row), [1, 1, 1, 327, 257, 407]);
});

test('one, two and three column layouts never overlap even with fractional heights', () => {
  const heights = [310.5, 240.2, 390.7, 280, 190.9, 270.1, 160];
  for (const columns of [1, 2, 3]) {
    const positions = projectPlacements(heights, columns, 16);
    positions.forEach((item, index) => {
      assert.equal(item.column, index % columns + 1);
      assert.ok(item.span >= heights[index]);
      if (index >= columns) {
        const previous = positions[index - columns];
        assert.equal(item.row, previous.row + previous.span + 16);
      } else assert.equal(item.row, 1);
    });
  }
  assert.deepEqual(projectPlacements([], 3, 16), []);
});
