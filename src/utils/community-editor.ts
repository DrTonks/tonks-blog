import {renderCommunityMarkdown} from "./community-markdown";
import {attachArticlePicker} from "./community-articles";
import "./community-articles.css";
import {getEmojiGroups,loadEmojiManifest,subscribeEmojis,renderEmojiText,recentEmojis,rememberEmoji} from "./community-emojis";
let emojiPickerId=0;
export function attachCommunityEmojiPicker(
	textarea: HTMLTextAreaElement,
	host: HTMLElement,
	options: {articles?:boolean} = {},
): void {
	if (host.querySelector("[data-community-emoji-toggle]")) return;
	textarea.maxLength = 800;
	const controller = new AbortController();
	const { signal } = controller;
	const toolbar = document.createElement("div");
	toolbar.className = "community-emoji-toolbar";
	const toggle = document.createElement("button");
	toggle.type = "button";
	toggle.className = "community-emoji-toggle";
	toggle.dataset.communityEmojiToggle = "true";
	toggle.setAttribute("aria-label", "选择表情");
	toggle.setAttribute("aria-expanded", "false");
	toggle.textContent = "☺ 表情";
	const picker = document.createElement("div");
	picker.id = `community-emoji-picker-${++emojiPickerId}`;
	picker.className = "community-emoji-picker";
	picker.hidden = true;
	picker.setAttribute("role", "region");
	picker.setAttribute("aria-label", "选择表情");
	toggle.setAttribute("aria-controls", picker.id);
	const header = document.createElement("div");
	header.className = "community-emoji-header";
	const searchToggle = document.createElement("button");
	searchToggle.type = "button";
	searchToggle.className = "community-emoji-search-toggle";
	searchToggle.setAttribute("aria-label", "搜索表情");
	searchToggle.title = "搜索表情";
	searchToggle.setAttribute("aria-expanded", "false");
	searchToggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
	const searchRow = document.createElement("div");
	searchRow.id = `${picker.id}-search`;
	searchRow.className = "community-emoji-search";
	searchRow.hidden = true;
	searchToggle.setAttribute("aria-controls", searchRow.id);
	const search = document.createElement("input");
	search.className = "community-emoji-search-input";
	search.type = "search";
	search.placeholder = "搜索全部表情";
	search.setAttribute("aria-label", "搜索全部表情");
	const searchClose = document.createElement("button");
	searchClose.type = "button";
	searchClose.className = "community-emoji-search-close";
	searchClose.setAttribute("aria-label", "关闭搜索");
	searchClose.title = "关闭搜索";
	searchClose.textContent = "×";
	searchRow.append(search, searchClose);
	const groups = document.createElement("div");
	groups.className = "community-emoji-groups";
	groups.setAttribute("role", "group");
	groups.setAttribute("aria-label", "表情分组");
	const grid = document.createElement("div");
	grid.className = "community-emoji-grid";
	grid.id = `${picker.id}-results`;
	search.setAttribute("aria-controls", grid.id);
	const more = document.createElement("button");
	more.type = "button";
	more.className = "community-emoji-more";
	more.textContent = "加载更多";
	more.setAttribute("aria-controls", grid.id);
	more.hidden = true;
	const message = document.createElement("p");
	message.className = "community-emoji-message";
	message.setAttribute("role", "status");
	const close = document.createElement("button");
	close.type = "button";
	close.textContent = "关闭表情";
	close.className = "community-emoji-close";
	header.append(groups, searchToggle);
	picker.append(header, searchRow, grid, message, more, close);
	const preview = document.createElement("div");
	preview.className = "community-comment-preview";
	preview.setAttribute("role", "region");
	preview.setAttribute("aria-label", "留言预览");
	const caption = document.createElement("strong");
	caption.textContent = "预览";
	const previewBody = document.createElement("div");
	preview.append(caption, previewBody);
	toolbar.append(toggle);
	host.append(toolbar, picker, preview);
	const detachArticles = options.articles === false ? () => {} : attachArticlePicker(textarea, toolbar);
	let activeGroup = getEmojiGroups()[0]?.id || "";
	let visibleLimit = 80;
	const requestManifest = () => {
		if (signal.aborted) return;
		// The shared loader deduplicates pending requests and caches successful loads.
		void loadEmojiManifest().catch(() => { /* Basic groups remain usable offline. */ });
	};
	const setSearchOpen = (open: boolean, restoreFocus = false) => {
		searchRow.hidden = !open;
		searchToggle.setAttribute("aria-expanded", String(open));
		searchToggle.setAttribute("aria-label", open ? "关闭搜索" : "搜索表情");
		searchToggle.title = open ? "关闭搜索" : "搜索表情";
		if (open) search.focus();
		else {
			search.value = "";
			visibleLimit = 80;
			refresh();
			if (restoreFocus) searchToggle.focus();
		}
	};
	const setOpen = (open: boolean, restoreFocus = false) => {
		picker.hidden = !open;
		toggle.setAttribute("aria-expanded", String(open));
		if (open) {
			refresh();
			requestManifest();
			groups.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
		} else {
			if (!searchRow.hidden || search.value) setSearchOpen(false);
			if (restoreFocus) toggle.focus();
		}
	};
	const updatePreview = () => {
		preview.hidden = !textarea.value;
		renderCommunityMarkdown(previewBody, textarea.value);
	};
	const refresh = () => {
		const available = [{ id: "__recent", label: "最近使用", items: recentEmojis() }, ...getEmojiGroups()];
		if (!available.some((group) => group.id === activeGroup)) activeGroup = available[1]?.id || "__recent";
		const focusedGroup = groups.contains(document.activeElement)
			? (document.activeElement as HTMLElement).dataset.emojiGroup : undefined;
		groups.replaceChildren();
		for (const group of available) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = group.label;
			button.dataset.emojiGroup = group.id;
			button.setAttribute("aria-pressed", String(group.id === activeGroup));
			button.addEventListener("click", () => { activeGroup = group.id; setSearchOpen(false); });
			groups.append(button);
			if (focusedGroup === group.id) button.focus();
		}
		const query = search.value.trim().toLocaleLowerCase();
		const items = query
			? getEmojiGroups().flatMap((group) => group.items.filter((item) =>
				`${group.label} ${item.label} ${item.token} ${item.text ?? ""}`.toLocaleLowerCase().includes(query)))
			: available.find((group) => group.id === activeGroup)?.items || [];
		grid.replaceChildren();
		const seen = new Set<string>();
		for (const item of items) {
			if (seen.has(item.token)) continue;
			seen.add(item.token);
			if (seen.size > visibleLimit) continue;
			const button = document.createElement("button");
			button.type = "button";
			button.className = "community-emoji-item";
			button.title = item.label;
			button.setAttribute("aria-label", item.label);
			renderEmojiText(button, item.text ?? item.token, { preview: false });
			button.addEventListener("click", () => {
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const insertion = item.text ?? item.token;
				if (textarea.value.length - (end - start) + insertion.length > 800) {
					message.textContent = "最多 800 字，剩余空间不足以插入这个表情。";
					return;
				}
				textarea.setRangeText(insertion, start, end, "end");
				textarea.dispatchEvent(new Event("input", { bubbles: true }));
				rememberEmoji(item);
				setOpen(false);
				textarea.focus();
			});
			grid.append(button);
		}
		const displayed = Math.min(visibleLimit, seen.size);
		more.hidden = displayed >= seen.size;
		more.setAttribute("aria-label", `加载更多表情，下一批 ${Math.min(80, seen.size - displayed)} 个`);
		message.textContent = seen.size ? `已显示 ${displayed} / ${seen.size} 个表情` : query ? "没有匹配的表情" : "暂无表情";
	};
	toggle.addEventListener("click", () => setOpen(picker.hidden), { signal });
	close.addEventListener("click", () => setOpen(false, true), { signal });
	searchToggle.addEventListener("click", () => setSearchOpen(searchRow.hidden, true), { signal });
	searchClose.addEventListener("click", () => setSearchOpen(false, true), { signal });
	search.addEventListener("keydown", (event) => {
		// Searching must never submit the surrounding comment form.
		if (event.key === "Enter") event.preventDefault();
	}, { signal });
	search.addEventListener("input", () => { visibleLimit = 80; refresh(); }, { signal });
	more.addEventListener("click", () => {
		const previousCount = grid.childElementCount;
		visibleLimit += 80;
		refresh();
		// Continue keyboard navigation at the first newly revealed result.
		(grid.children[previousCount] as HTMLElement | undefined)?.focus();
	}, { signal });
	textarea.addEventListener("input", updatePreview, { signal });
	textarea.addEventListener("community:content-sync", updatePreview, { signal });
	host.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && !picker.hidden) {
			event.preventDefault();
			event.stopPropagation();
			if (!searchRow.hidden) setSearchOpen(false, true);
			else setOpen(false, true);
		}
	}, { signal });
	document.addEventListener("pointerdown", (event) => {
		if (event.target instanceof Node && !host.contains(event.target)) setOpen(false);
	}, { signal });
	document.addEventListener("focusin", (event) => {
		if (event.target instanceof Node && !host.contains(event.target)) setOpen(false);
	}, { signal });
	const unsubscribe = subscribeEmojis(() => {
		if (signal.aborted || !host.isConnected) return;
		if (!picker.hidden) refresh();
		updatePreview();
	});
	// Reply composers are created detached; observe their later removal and Swup replacements.
	const observer = new MutationObserver(() => {
		if (!host.isConnected) {
			controller.abort(); unsubscribe(); detachArticles(); observer.disconnect();
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
	updatePreview();
	requestManifest();
}
