export interface FriendArticle {
	feedUrl: string;
	title: string;
	url: string;
	summary: string;
	publishedAt: string;
	stale?: boolean;
}

export function isRecentFriendArticle(article: FriendArticle, now = Date.now()): boolean {
	const published = Date.parse(article.publishedAt);
	return Number.isFinite(published) && published > now - 7 * 86400000 && published <= now + 300_000;
}

/** Only one (latest) entry per feed within seven days, weighted by freshness. */
export function pickFriendArticle(articles: FriendArticle[], currentFeed?: string, now = Date.now(), random = Math.random): FriendArticle | undefined {
	const newest = new Map<string, FriendArticle>();
	for (const article of articles) {
		const date = Date.parse(article.publishedAt);
		if (!isRecentFriendArticle(article, now) || !/^https?:\/\//i.test(article.url)) continue;
		const previous = newest.get(article.feedUrl);
		if (!previous || date > Date.parse(previous.publishedAt)) newest.set(article.feedUrl, article);
	}
	const candidates = [...newest.values()].filter(article => newest.size < 2 || article.feedUrl !== currentFeed);
	if (!candidates.length) return;
	const newestDate = Math.max(...candidates.map(article => Date.parse(article.publishedAt)));
	const weights = candidates.map(article => Math.max(Number.MIN_VALUE, 2 ** ((Date.parse(article.publishedAt) - newestDate) / (7 * 86400000))));
	let threshold = random() * weights.reduce((total, weight) => total + weight, 0);
	return candidates.find((_, index) => (threshold -= weights[index]) < 0) ?? candidates.at(-1);
}

export function friendUpdateLabel(publishedAt: string, now = Date.now()): string {
	const elapsed = Math.max(0, now - Date.parse(publishedAt));
	if (!Number.isFinite(elapsed)) return "更新时间未知";
	if (elapsed < 3600000) return "刚刚更新";
	if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前更新`;
	return `${Math.floor(elapsed / 86400000)} 天前更新`;
}
