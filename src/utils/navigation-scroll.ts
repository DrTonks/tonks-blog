/** Cap travel, not document height. Preserve every scroll already within 1200px. */
export function boundedNavigationScroll(current: number, target: number, maximum: number) {
	const max = Math.max(0, maximum);
	const destination = Math.max(0, Math.min(target, max));
	const distance = current - destination;
	const start = Math.abs(distance) <= 1200
		? current
		: Math.max(0, Math.min(max, destination + Math.sign(distance) * 1200));
	return { start, target: destination };
}
