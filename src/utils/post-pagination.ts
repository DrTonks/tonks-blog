export const CHUNK_SIZE = 8;
export function pageSizeForLayout(grid: boolean, width: number): number {
  return grid && width > 910 ? 12 : 8;
}
export function pageForIndex(index: number, size: number, total: number): number {
  return Math.floor(Math.max(0, Math.min(index, Math.max(0, total - 1))) / size) + 1;
}
export function pageIndices(page: number, size: number, total: number): number[] {
  const start = (page - 1) * size;
  return Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => start + i);
}

// Both possible sizes for this real route. At most 20 cards, including the
// visible eight; inert templates never request their images or enter search.
export function routeCardIndices(page: number, total: number): number[] {
  return [...new Set([8, 12].flatMap(size =>
    pageIndices(Math.min(page, Math.max(1, Math.ceil(total / size))), size, total)
  ))].sort((a, b) => a - b);
}

export function paginationNumbers(page: number, last: number): number[] {
  let left = Math.max(1, page - 2);
  let right = Math.min(last, left + 4);
  left = Math.max(1, right - 4);
  const result: number[] = [];
  if (left > 1) result.push(1);
  if (left === 3) result.push(2);
  if (left > 3) result.push(-1);
  for (let i = left; i <= right; i++) result.push(i);
  if (right < last - 2) result.push(-1);
  if (right === last - 2) result.push(last - 1);
  if (right < last) result.push(last);
  return result;
}
