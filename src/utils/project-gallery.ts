import type { Project } from "../data/projects";

// Parse calendar dates explicitly: older entries may omit month/day padding.
export function projectDate(value?: string) {
  const parts = value?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!parts) return null;
  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const mm = String(month).padStart(2, "0");
  return { iso: `${year}-${mm}-${String(day).padStart(2, "0")}`, label: `${year}.${mm}`, order: date.getTime() };
}

export function newestProjects(projects: Project[]) {
  return [...projects].sort((a, b) =>
    (projectDate(b.startDate)?.order ?? -Infinity) - (projectDate(a.startDate)?.order ?? -Infinity));
}

// Round-robin columns preserve newest-first rows without stretching short cards.
export function projectPlacements(heights: number[], columns: number, gap: number) {
  const bottoms = Array<number>(columns).fill(0);
  return heights.map((height, index) => {
    const column = index % columns;
    const span = Math.max(1, Math.ceil(height));
    const row = bottoms[column] + 1;
    bottoms[column] += span + Math.ceil(gap);
    return { column: column + 1, row, span };
  });
}
