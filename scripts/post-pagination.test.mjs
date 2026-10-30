import test from 'node:test';
import assert from 'node:assert/strict';
import { pageForIndex, pageIndices, pageSizeForLayout, routeCardIndices, paginationNumbers } from '../src/utils/post-pagination.ts';

test('layout thresholds use article-list width and keep list mode short', () => {
  assert.equal(pageSizeForLayout(true, 909.9), 8);
  assert.equal(pageSizeForLayout(true, 910), 8);
  assert.equal(pageSizeForLayout(true, 910.1), 12);
  assert.equal(pageSizeForLayout(false, 1800), 8);
});
test('all page sizes cover the ordered collection exactly once, including final partial pages', () => {
  for (const total of [0, 1, 8, 9, 12, 26, 97]) for (const size of [8, 12]) {
    const actual = Array.from({length: Math.ceil(total / size)}, (_, i) => pageIndices(i + 1, size, total)).flat();
    assert.deepEqual(actual, Array.from({length: total}, (_, i) => i));
    for (const index of actual) assert.ok(pageIndices(pageForIndex(index, size, total), size, total).includes(index));
  }
});
test('layout changes preserve the anchor article instead of the old page number', () => {
  const index = 12;
  assert.equal(pageForIndex(index, 8, 26), 2);
  assert.equal(pageForIndex(24, 12, 26), 3);
  assert.equal(pageForIndex(1000, 12, 26), 3);
});
test('each static route contains both complete page sizes with a bounded inert reserve', () => {
  for (const total of [0, 1, 9, 26, 101, 1000]) {
    for (let page = 1; page <= Math.max(1, Math.ceil(total / 8)); page++) {
      const pool = routeCardIndices(page, total);
      assert.ok(pool.length <= 20);
      assert.equal(new Set(pool).size, pool.length);
      assert.ok(pool.every(index => index >= 0 && index < total));
      for (const size of [8, 12]) {
        const selected = Math.min(page, Math.max(1, Math.ceil(total / size)));
        assert.ok(pageIndices(selected, size, total).every(index => pool.includes(index)));
      }
    }
  }
});

test('pagination retains the original five-page window and boundary ellipses', () => {
  assert.deepEqual(paginationNumbers(1, 1), [1]);
  assert.deepEqual(paginationNumbers(2, 4), [1, 2, 3, 4]);
  assert.deepEqual(paginationNumbers(1, 10), [1, 2, 3, 4, 5, -1, 10]);
  assert.deepEqual(paginationNumbers(5, 10), [1, 2, 3, 4, 5, 6, 7, -1, 10]);
  assert.deepEqual(paginationNumbers(10, 10), [1, -1, 6, 7, 8, 9, 10]);
});
