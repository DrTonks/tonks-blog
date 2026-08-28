import { getBlogClientId } from "./visitor-id";

const API_BASE = (import.meta.env.PUBLIC_SLEEPY_API_BASE || "/api").replace(/\/$/, "");
const PROFILE_KEY = "sleepy-blog-comment-profile";

type LikeState = { count: number; liked: boolean };
type LikesResponse = { success: boolean; likes: Record<string, LikeState> };
type ToggleLikeResponse = { success: boolean; target: string; count: number; liked: boolean; message?: string };

type PublicComment = {
	id: number;
	page: "about" | "friends";
	parent_id: number | null;
	root_id: number;
	nickname: string;
	website: string;
	content: string;
	created_at: string;
	reply_to_name: string;
};

type CommentsResponse = { success: boolean; comments: PublicComment[]; count: number; message?: string; code?: string };
type SubmitResponse = {
	success: boolean;
	status?: "published" | "pending";
	comment?: PublicComment | null;
	message?: string;
	code?: string;
};

class CommunityApiError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

function clientHeaders(json = false): HeadersInit {
	return {
		Accept: "application/json",
		"X-Client-ID": getBlogClientId(),
		...(json ? { "Content-Type": "application/json" } : {}),
	};
}

async function readJson<T extends { success: boolean; message?: string; code?: string }>(response: Response): Promise<T> {
	if (!response.ok) throw new CommunityApiError("network", `互动接口返回 HTTP ${response.status}`);
	const result = (await response.json()) as T;
	if (!result.success) throw new CommunityApiError(result.code || "request_failed", result.message || "互动请求失败");
	return result;
}

function setLikeState(target: string, state: LikeState): void {
	for (const shell of document.querySelectorAll<HTMLElement>("[data-community-like]")) {
		if (shell.dataset.communityLike !== target) continue;
		const button = shell.querySelector<HTMLButtonElement>(".community-like__button");
		const count = shell.querySelector<HTMLElement>("[data-like-count]");
		button?.setAttribute("aria-pressed", String(state.liked));
		if (count) count.textContent = String(state.count);
	}
}

function pulseLike(shell: HTMLElement): void {
	shell.classList.remove("is-pulsing");
	void shell.offsetWidth;
	shell.classList.add("is-pulsing");
	setTimeout(() => shell.classList.remove("is-pulsing"), 500);
}

function dropAboutHearts(shell: HTMLElement): void {
	pulseLike(shell);
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const layer = shell.querySelector<HTMLElement>("[data-like-particles]");
	const button = shell.querySelector<HTMLElement>(".community-like__button");
	if (!layer || !button) return;

	while (layer.childElementCount > 18) layer.firstElementChild?.remove();
	const layerRect = layer.getBoundingClientRect();
	const buttonRect = button.getBoundingClientRect();
	const startX = buttonRect.left + buttonRect.width / 2 - layerRect.left;
	const startY = buttonRect.top + buttonRect.height / 2 - layerRect.top;
	const floor = Math.max(startY + 48, layerRect.height - 10);

	for (let index = 0; index < 9; index += 1) {
		const heart = document.createElement("span");
		heart.className = "community-heart-particle";
		heart.textContent = "♥";
		heart.style.setProperty("--heart-size", `${0.72 + Math.random() * 0.75}rem`);
		layer.append(heart);

		let x = startX + (Math.random() - 0.5) * 20;
		let y = startY;
		let velocityX = (Math.random() - 0.5) * 0.16;
		let velocityY = -0.22 - Math.random() * 0.2;
		let rotation = (Math.random() - 0.5) * 35;
		let bounced = false;
		let previous = performance.now();
		const born = previous;

		const frame = (now: number) => {
			if (!heart.isConnected) return;
			const delta = Math.min(32, now - previous);
			previous = now;
			velocityY += 0.00072 * delta;
			x += velocityX * delta;
			y += velocityY * delta;
			rotation += velocityX * delta * 0.9;
			if (y >= floor && !bounced) {
				y = floor;
				velocityY *= -0.38;
				velocityX *= 0.72;
				bounced = true;
			}
			const age = now - born;
			const opacity = age > 1050 ? Math.max(0, 1 - (age - 1050) / 650) : 1;
			heart.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
			heart.style.opacity = String(opacity);
			if (age < 1700) requestAnimationFrame(frame);
			else heart.remove();
		};
		requestAnimationFrame(frame);
	}
}

function runLikeEffect(shell: HTMLElement): void {
	if (shell.dataset.likeVariant === "about") dropAboutHearts(shell);
	else pulseLike(shell);
}

function setTransientStatus(element: HTMLElement | null, message: string): void {
	if (!element) return;
	element.textContent = message;
	setTimeout(() => {
		if (element.textContent === message) element.textContent = "";
	}, 2400);
}

async function initializeLikes(): Promise<void> {
	const shells = [...document.querySelectorAll<HTMLElement>("[data-community-like]")];
	if (shells.length === 0) return;
	const targets = [...new Set(shells.map((shell) => shell.dataset.communityLike).filter(Boolean))] as string[];
	const params = new URLSearchParams();
	for (const target of targets) params.append("targets", target);

	try {
		const result = await readJson<LikesResponse>(
			await fetch(`${API_BASE}/blog/community/likes?${params}`, { headers: clientHeaders() }),
		);
		for (const [target, state] of Object.entries(result.likes)) setLikeState(target, state);
	} catch (error) {
		console.warn("[blog community] failed to load likes", error);
		for (const shell of shells) {
			const count = shell.querySelector<HTMLElement>("[data-like-count]");
			if (count) count.textContent = "0";
		}
	}

	for (const shell of shells) {
		if (shell.dataset.communityBound === "true") continue;
		shell.dataset.communityBound = "true";
		const target = shell.dataset.communityLike;
		const button = shell.querySelector<HTMLButtonElement>(".community-like__button");
		const status = shell.querySelector<HTMLElement>("[data-like-status]");
		if (!target || !button) continue;
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				const result = await readJson<ToggleLikeResponse>(
					await fetch(`${API_BASE}/blog/community/likes/${encodeURI(target)}`, {
						method: "POST",
						headers: clientHeaders(),
					}),
				);
				setLikeState(result.target, { count: result.count, liked: result.liked });
				if (result.liked) runLikeEffect(shell);
				else pulseLike(shell);
				setTransientStatus(status, result.liked ? "收到这颗心了" : "已经轻轻收回");
			} catch (error) {
				const message = error instanceof Error ? error.message : "点赞暂时失败";
				setTransientStatus(status, message);
			} finally {
				button.disabled = false;
			}
		});
	}
}

function avatarHue(value: string): number {
	let hash = 0;
	for (const character of value) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
	return hash % 360;
}

function initials(value: string): string {
	return Array.from(value.trim()).slice(0, 2).join("").toUpperCase() || "?";
}

function formatCommentTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(date);
}

function commentName(comment: PublicComment): HTMLElement {
	const name = comment.website ? document.createElement("a") : document.createElement("strong");
	name.className = "community-comment__name";
	name.textContent = comment.nickname;
	if (name instanceof HTMLAnchorElement) {
		name.href = comment.website;
		name.target = "_blank";
		name.rel = "noopener noreferrer nofollow ugc";
	}
	return name;
}

function buildComment(
	comment: PublicComment,
	onReply: (comment: PublicComment) => void,
): HTMLElement {
	const article = document.createElement("article");
	article.className = "community-comment";
	article.dataset.commentId = String(comment.id);

	const main = document.createElement("div");
	main.className = "community-comment__main";
	const avatar = document.createElement("span");
	avatar.className = "community-comment__avatar";
	avatar.textContent = initials(comment.nickname);
	avatar.style.setProperty("--avatar-hue", String(avatarHue(comment.nickname)));
	avatar.style.setProperty("--avatar-angle", `${((comment.id % 5) - 2) * 0.8}deg`);

	const body = document.createElement("div");
	const meta = document.createElement("div");
	meta.className = "community-comment__meta";
	meta.append(commentName(comment));
	if (comment.reply_to_name) {
		const replyTo = document.createElement("span");
		replyTo.className = "community-comment__reply-to";
		replyTo.textContent = `回复 @${comment.reply_to_name}`;
		meta.append(replyTo);
	}
	const time = document.createElement("time");
	time.className = "community-comment__time";
	time.dateTime = comment.created_at;
	time.textContent = formatCommentTime(comment.created_at);
	meta.append(time);

	const content = document.createElement("p");
	content.className = "community-comment__content";
	content.textContent = comment.content;
	const reply = document.createElement("button");
	reply.type = "button";
	reply.className = "community-comment__reply-button";
	reply.textContent = "↳ 回复";
	reply.addEventListener("click", () => onReply(comment));
	body.append(meta, content, reply);
	main.append(avatar, body);
	article.append(main);
	return article;
}

function renderComments(
	section: HTMLElement,
	comments: PublicComment[],
	onReply: (comment: PublicComment) => void,
): void {
	const list = section.querySelector<HTMLElement>("[data-comment-list]");
	const count = section.querySelector<HTMLElement>("[data-comment-count]");
	if (count) count.textContent = String(comments.length);
	if (!list) return;
	list.replaceChildren();
	if (comments.length === 0) {
		const empty = document.createElement("p");
		empty.className = "community-comments__empty";
		empty.textContent = "留言板还是空的，来留下第一张纸条吧。";
		list.append(empty);
		return;
	}

	const roots = comments.filter((comment) => comment.id === comment.root_id);
	const replies = new Map<number, PublicComment[]>();
	for (const comment of comments) {
		if (comment.id === comment.root_id) continue;
		const group = replies.get(comment.root_id) || [];
		group.push(comment);
		replies.set(comment.root_id, group);
	}
	for (const root of roots) {
		const rootElement = buildComment(root, onReply);
		const children = replies.get(root.id) || [];
		if (children.length > 0) {
			const replyList = document.createElement("div");
			replyList.className = "community-comment__replies";
			for (const child of children) replyList.append(buildComment(child, onReply));
			rootElement.append(replyList);
		}
		list.append(rootElement);
	}
}

function readProfile(): { nickname?: string; email?: string; website?: string } {
	try {
		return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") as Record<string, string>;
	} catch {
		return {};
	}
}

async function initializeCommentSection(section: HTMLElement): Promise<void> {
	if (section.dataset.communityBound === "true") return;
	section.dataset.communityBound = "true";
	const page = section.dataset.communityComments;
	const form = section.querySelector<HTMLFormElement>("[data-comment-form]");
	const list = section.querySelector<HTMLElement>("[data-comment-list]");
	if (!page || !form || !list) return;

	const profile = readProfile();
	for (const field of ["nickname", "email", "website"] as const) {
		const input = form.elements.namedItem(field);
		if (input instanceof HTMLInputElement && profile[field]) input.value = profile[field] || "";
	}
	const content = form.elements.namedItem("content");
	const contentCount = section.querySelector<HTMLElement>("[data-content-count]");
	if (content instanceof HTMLTextAreaElement && contentCount) {
		const updateCount = () => { contentCount.textContent = String(content.value.length); };
		content.addEventListener("input", updateCount);
		updateCount();
	}

	const parentInput = form.elements.namedItem("parent_id");
	const replyContext = section.querySelector<HTMLElement>("[data-reply-context]");
	const replyName = section.querySelector<HTMLElement>("[data-reply-name]");
	const setReply = (comment?: PublicComment) => {
		if (parentInput instanceof HTMLInputElement) parentInput.value = comment ? String(comment.id) : "";
		if (replyContext) replyContext.hidden = !comment;
		if (replyName) replyName.textContent = comment?.nickname || "";
		if (comment) {
			form.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
			if (content instanceof HTMLTextAreaElement) setTimeout(() => content.focus(), 250);
		}
	};
	section.querySelector<HTMLButtonElement>("[data-cancel-reply]")?.addEventListener("click", () => setReply());

	const load = async () => {
		try {
			const result = await readJson<CommentsResponse>(
				await fetch(`${API_BASE}/blog/community/comments/${page}`, { headers: clientHeaders() }),
			);
			if (section.isConnected) renderComments(section, result.comments, setReply);
		} catch (error) {
			console.warn("[blog community] failed to load comments", error);
			if (section.isConnected) list.textContent = "留言暂时没有接通，稍后再来看看。";
		}
	};
	void load();

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!form.reportValidity()) return;
		const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
		const status = section.querySelector<HTMLElement>("[data-comment-form-status]");
		const data = new FormData(form);
		const payload = {
			parent_id: data.get("parent_id") || null,
			nickname: String(data.get("nickname") || ""),
			email: String(data.get("email") || ""),
			website: String(data.get("website") || ""),
			content: String(data.get("content") || ""),
		};
		if (submit) submit.disabled = true;
		if (status) {
			status.dataset.state = "busy";
			status.textContent = "正在检查这条留言…";
		}
		try {
			const result = await readJson<SubmitResponse>(
				await fetch(`${API_BASE}/blog/community/comments/${page}`, {
					method: "POST",
					headers: clientHeaders(true),
					body: JSON.stringify(payload),
				}),
			);
			localStorage.setItem(PROFILE_KEY, JSON.stringify({
				nickname: payload.nickname,
				email: payload.email,
				website: payload.website,
			}));
			if (content instanceof HTMLTextAreaElement) content.value = "";
			if (contentCount) contentCount.textContent = "0";
			setReply();
			if (status) {
				status.dataset.state = "success";
				status.textContent = result.message || "评论已提交";
			}
			if (result.status === "published") await load();
		} catch (error) {
			if (status) {
				status.dataset.state = "error";
				status.textContent = error instanceof Error ? error.message : "评论提交失败";
			}
		} finally {
			if (submit) submit.disabled = false;
		}
	});
}

function initializeComments(): void {
	for (const section of document.querySelectorAll<HTMLElement>("[data-community-comments]")) {
		void initializeCommentSection(section);
	}
}

let scheduledFrame: number | undefined;
function scheduleCommunity(): void {
	if (scheduledFrame !== undefined) cancelAnimationFrame(scheduledFrame);
	scheduledFrame = requestAnimationFrame(() => {
		scheduledFrame = undefined;
		void initializeLikes();
		initializeComments();
	});
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleCommunity, { once: true });
else scheduleCommunity();

function registerSwupHook(): void {
	const swup = (window as Window & { swup?: { hooks?: { on: (name: string, callback: () => void) => void } } }).swup;
	swup?.hooks?.on("page:view", scheduleCommunity);
}

if ((window as Window & { swup?: unknown }).swup) registerSwupHook();
else document.addEventListener("swup:enable", registerSwupHook, { once: true });
