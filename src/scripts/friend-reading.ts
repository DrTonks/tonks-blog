import type { FriendLink } from "../data/friends";
import { friendUpdateLabel, isRecentFriendArticle, pickFriendArticle, type FriendArticle } from "../utils/friend-reading";

const apiBase = (import.meta.env.PUBLIC_SLEEPY_API_BASE || "/api").replace(/\/$/, "");
const initialized = new WeakSet<HTMLElement>();
const safeWebUrl = (value: unknown): value is string => {
	if (typeof value !== "string") return false;
	try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; }
};

async function initializeDailyRead() {
	const card = document.querySelector<HTMLElement>("[data-daily-read]");
	if (!card || initialized.has(card)) return;
	initialized.add(card);
	const friends = JSON.parse(card.dataset.friends || "[]") as FriendLink[];
	const configured = new Map(friends.map(friend => [friend.rss, friend]));
	const query = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
	const button = query<HTMLButtonElement>("[data-daily-refresh]");
	const title = query<HTMLElement>("[data-daily-title]");
	const summary = query<HTMLElement>("[data-daily-summary]");
	let articles: FriendArticle[] = [];
	let currentFeed: string | undefined;
	function syncRefreshAvailability() {
		button.disabled = new Set(articles.filter(item => isRecentFriendArticle(item)).map(item => item.feedUrl)).size < 2;
	}

	function render(animate = false) {
		const article = pickFriendArticle(articles, currentFeed);
		const friend = article && configured.get(article.feedUrl);
		if (!article || !friend) {
			currentFeed = undefined;
			title.textContent = "这周，朋友们还没有新文章";
			summary.textContent = "这里留给最近 7 天的新文字，过几天再来翻翻吧。";
			button.disabled = true;
			for (const anchor of card!.querySelectorAll<HTMLAnchorElement>("[data-daily-link], [data-daily-read-link]")) anchor.removeAttribute("href");
			query<HTMLElement>("[data-daily-source]").hidden = true;
			query<HTMLElement>("[data-daily-read-link]").hidden = true;
			return;
		}
		currentFeed = article.feedUrl;
		title.textContent = article.title;
		summary.textContent = article.summary;
		for (const anchor of card!.querySelectorAll<HTMLAnchorElement>("[data-daily-link], [data-daily-read-link]")) {
			anchor.href = article.url;
			anchor.hidden = false;
			anchor.removeAttribute("aria-disabled");
		}
		const site = query<HTMLAnchorElement>("[data-daily-site]");
		site.href = friend.url;
		site.textContent = friend.name;
		query<HTMLElement>("[data-daily-source]").hidden = false;
		const date = query<HTMLTimeElement>("[data-daily-date]");
		date.dateTime = article.publishedAt;
		date.textContent = friendUpdateLabel(article.publishedAt);
		date.title = new Date(article.publishedAt).toLocaleString();
		query<HTMLElement>("[data-daily-stale]").hidden = !article.stale;
		query<HTMLElement>("[data-daily-status]").textContent = `来自 ${friend.name}：${article.title}`;
		syncRefreshAvailability();
		if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
			const content = query<HTMLElement>("[data-daily-content]");
			content.getAnimations().forEach(animation => animation.cancel());
			content.animate([{ opacity: .3, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 200 });
		}
	}
	button.addEventListener("click", () => render(true));
	function updateStatuses() {
		for (const node of document.querySelectorAll<HTMLTimeElement>("[data-friend-feed]")) {
			const article = articles.find(item => item.feedUrl === node.dataset.friendFeed);
			if (article) {
				node.dateTime = article.publishedAt;
				node.textContent = friendUpdateLabel(article.publishedAt) + (article.stale ? " · 缓存" : "");
				node.title = `${new Date(article.publishedAt).toLocaleString()}${article.stale ? "（上次检查未成功，保留此前记录）" : "（每天检查一次）"}`;
			} else {
				node.textContent = "暂未获取更新";
			}
		}
	}
	try {
		for (let attempt = 0; attempt < 10; attempt++) {
			if (!card.isConnected) return;
			const response = await fetch(`${apiBase}/blog/friend-feeds`, { signal: AbortSignal.timeout(10000), credentials: "omit" });
			if (!response.ok) throw new Error("Feed cache unavailable");
			const data = await response.json();
			if (!card.isConnected) return;
			if (data.schema !== 1 || !Array.isArray(data.articles)) throw new Error("Invalid feed cache");
			articles = data.articles.filter((item: FriendArticle) => item && configured.has(item.feedUrl) && safeWebUrl(item.url) && typeof item.title === "string" && typeof item.summary === "string" && Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) <= Date.now() + 300000);
			syncRefreshAvailability();
			if ((articles.length || currentFeed) && !articles.some(item => item.feedUrl === currentFeed && isRecentFriendArticle(item))) render();
			updateStatuses();
			if (!data.pending) break;
			await new Promise(resolve => setTimeout(resolve, 3000));
		}
		if (!articles.length) {
			title.textContent = "新的一页，还在路上";
			summary.textContent = "暂时没有获取到好友文章。可以先从下面的友链去看看。";
		}
	} catch {
		if (!card.isConnected) return;
		if (!currentFeed) {
			title.textContent = "稍后再来读一篇";
			summary.textContent = "暂时无法读取好友更新，下方友链仍可正常访问。";
		}
		updateStatuses();
	}
}

void initializeDailyRead();
document.addEventListener("astro:page-load", () => void initializeDailyRead());
const register = () => window.swup?.hooks.on("page:view", () => void initializeDailyRead());
if (window.swup) register();
else document.addEventListener("swup:enable", register, { once: true });
