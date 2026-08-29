import { getBlogClientId } from "./visitor-id";

const API_BASE = (import.meta.env.PUBLIC_SLEEPY_API_BASE || "/api").replace(
	/\/$/,
	"",
);
const PROFILE_KEY = "sleepy-blog-comment-profile";
const ADMIN_KEY = "admin_secret";

type LikeState = { count: number; liked: boolean };
type LikesResponse = { success: boolean; likes: Record<string, LikeState> };
type ToggleLikeResponse = {
	success: boolean;
	target: string;
	count: number;
	liked: boolean;
	message?: string;
};

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
	status?: "published" | "pending" | "rejected";
	is_admin?: boolean;
	moderation_reason?: string;
};

type CommentsResponse = {
	success: boolean;
	comments: PublicComment[];
	count: number;
	message?: string;
	code?: string;
};
type SubmitResponse = {
	success: boolean;
	status?: "published" | "pending";
	comment?: PublicComment | null;
	message?: string;
	code?: string;
};

type CommentProfile = {
	nickname?: string;
	email?: string;
	website?: string;
};

type CommentPayload = {
	parent_id: number | null;
	nickname: string;
	email: string;
	website: string;
	content: string;
};

type FriendApplicationResponse = {
	success: boolean;
	status?: string;
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

function adminHeaders(secret: string, json = false): HeadersInit {
	return { ...clientHeaders(json), "X-Admin-Secret": secret };
}

async function readJson<
	T extends { success: boolean; message?: string; code?: string },
>(response: Response): Promise<T> {
	if (!response.ok)
		throw new CommunityApiError(
			"network",
			`互动接口返回 HTTP ${response.status}`,
		);
	const result = (await response.json()) as T;
	if (!result.success)
		throw new CommunityApiError(
			result.code || "request_failed",
			result.message || "互动请求失败",
		);
	return result;
}

function setLikeState(target: string, state: LikeState): void {
	for (const shell of document.querySelectorAll<HTMLElement>(
		"[data-community-like]",
	)) {
		if (shell.dataset.communityLike !== target) continue;
		const button = shell.querySelector<HTMLButtonElement>(
			".community-like__button",
		);
		const count = shell.querySelector<HTMLElement>("[data-like-count]");
		button?.setAttribute("aria-pressed", String(state.liked));
		if (count) count.textContent = String(state.count);
		if (
			shell.dataset.likeVariant === "about" ||
			shell.dataset.likeVariant === "friends"
		)
			syncHeartPhysics(shell, state.count);
	}
}

function pulseLike(shell: HTMLElement): void {
	shell.classList.remove("is-pulsing");
	void shell.offsetWidth;
	shell.classList.add("is-pulsing");
	setTimeout(() => shell.classList.remove("is-pulsing"), 500);
}

type HeartParticle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	rotation: number;
	angularVelocity: number;
};

type HeartPhysicsField = {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	hearts: HeartParticle[];
	rawCount: number;
	desiredCount: number;
	width: number;
	height: number;
	dpr: number;
	frameId: number;
	spawnTimer: number;
	lastFrame: number;
	stepCount: number;
	settledFrames: number;
};

const HEART_VISUAL_LIMIT = 80;
const heartPhysicsFields = new WeakMap<HTMLCanvasElement, HeartPhysicsField>();
const activeHeartPhysicsFields = new Set<HeartPhysicsField>();
let heartPhysicsGlobalsReady = false;

function purgeHeartPhysicsFields(): void {
	for (const field of activeHeartPhysicsFields) {
		if (field.canvas.isConnected) continue;
		cancelAnimationFrame(field.frameId);
		window.clearTimeout(field.spawnTimer);
		activeHeartPhysicsFields.delete(field);
	}
}

function resizeHeartPhysicsField(field: HeartPhysicsField): void {
	const { canvas, context } = field;
	const rect = canvas.getBoundingClientRect();
	const nextWidth = Math.max(72, rect.width);
	const nextHeight = Math.max(48, rect.height);
	const nextDpr = Math.min(2, window.devicePixelRatio || 1);
	const scaleX = field.width > 0 ? nextWidth / field.width : 1;
	const scaleY = field.height > 0 ? nextHeight / field.height : 1;

	field.width = nextWidth;
	field.height = nextHeight;
	field.dpr = nextDpr;
	canvas.width = Math.round(nextWidth * nextDpr);
	canvas.height = Math.round(nextHeight * nextDpr);
	context.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
	for (const heart of field.hearts) {
		heart.x = Math.min(
			nextWidth - heart.radius,
			Math.max(heart.radius, heart.x * scaleX),
		);
		heart.y = Math.min(
			nextHeight - heart.radius,
			Math.max(-heart.radius, heart.y * scaleY),
		);
	}
}

function drawHeart(
	context: CanvasRenderingContext2D,
	heart: HeartParticle,
	color: string,
): void {
	const radius = heart.radius;
	context.save();
	context.translate(heart.x, heart.y);
	context.rotate(heart.rotation);
	context.beginPath();
	context.moveTo(0, radius * 0.82);
	context.bezierCurveTo(
		-radius * 1.1,
		radius * 0.12,
		-radius * 0.92,
		-radius * 0.75,
		-radius * 0.42,
		-radius * 0.72,
	);
	context.bezierCurveTo(
		-radius * 0.14,
		-radius * 0.7,
		0,
		-radius * 0.47,
		0,
		-radius * 0.3,
	);
	context.bezierCurveTo(
		0,
		-radius * 0.47,
		radius * 0.14,
		-radius * 0.7,
		radius * 0.42,
		-radius * 0.72,
	);
	context.bezierCurveTo(
		radius * 0.92,
		-radius * 0.75,
		radius * 1.1,
		radius * 0.12,
		0,
		radius * 0.82,
	);
	context.closePath();
	context.globalAlpha = 0.76;
	context.fillStyle = color;
	context.fill();
	context.globalAlpha = 0.18;
	context.lineWidth = 0.8;
	context.strokeStyle = color;
	context.stroke();
	context.restore();
}

function drawHeartPhysicsField(field: HeartPhysicsField): void {
	field.context.clearRect(0, 0, field.width, field.height);
	const color = getComputedStyle(field.canvas).color;
	for (const heart of field.hearts) drawHeart(field.context, heart, color);
	field.canvas.dataset.heartParticles = String(field.hearts.length);
}

function constrainHeart(field: HeartPhysicsField, heart: HeartParticle): void {
	if (heart.x - heart.radius < 0) {
		heart.x = heart.radius;
		heart.vx = Math.abs(heart.vx) * 0.58;
	} else if (heart.x + heart.radius > field.width) {
		heart.x = field.width - heart.radius;
		heart.vx = -Math.abs(heart.vx) * 0.58;
	}

	if (heart.y + heart.radius > field.height) {
		heart.y = field.height - heart.radius;
		heart.vy = Math.abs(heart.vy) < 0.045 ? 0 : -Math.abs(heart.vy) * 0.42;
		heart.vx *= 0.88;
		heart.angularVelocity *= 0.82;
	}
}

function resolveHeartCollisions(field: HeartPhysicsField): void {
	for (let pass = 0; pass < 2; pass += 1) {
		for (let leftIndex = 0; leftIndex < field.hearts.length; leftIndex += 1) {
			const left = field.hearts[leftIndex];
			for (
				let rightIndex = leftIndex + 1;
				rightIndex < field.hearts.length;
				rightIndex += 1
			) {
				const right = field.hearts[rightIndex];
				const deltaX = right.x - left.x;
				const deltaY = right.y - left.y;
				const minimumDistance = left.radius + right.radius;
				const distanceSquared = deltaX * deltaX + deltaY * deltaY;
				if (distanceSquared >= minimumDistance * minimumDistance) continue;

				const distance = Math.sqrt(distanceSquared) || 0.001;
				const normalX = deltaX / distance;
				const normalY = deltaY / distance;
				const correction = (minimumDistance - distance) * 0.5;
				left.x -= normalX * correction;
				left.y -= normalY * correction;
				right.x += normalX * correction;
				right.y += normalY * correction;

				const relativeVelocity =
					(right.vx - left.vx) * normalX + (right.vy - left.vy) * normalY;
				if (relativeVelocity < 0) {
					const impulse = (-(1 + 0.34) * relativeVelocity) / 2;
					left.vx -= impulse * normalX;
					left.vy -= impulse * normalY;
					right.vx += impulse * normalX;
					right.vy += impulse * normalY;
				}
			}
		}
	}
}

function animateHeartPhysicsField(field: HeartPhysicsField, now: number): void {
	if (!field.canvas.isConnected) {
		activeHeartPhysicsFields.delete(field);
		return;
	}
	const delta = Math.min(32, Math.max(8, now - (field.lastFrame || now - 16)));
	field.lastFrame = now;
	field.stepCount += 1;

	for (const heart of field.hearts) {
		heart.vy += 0.00105 * delta;
		heart.x += heart.vx * delta;
		heart.y += heart.vy * delta;
		heart.rotation += heart.angularVelocity * delta;
		heart.vx *= 0.995 ** (delta / 16);
		heart.angularVelocity *= 0.993 ** (delta / 16);
		constrainHeart(field, heart);
	}
	resolveHeartCollisions(field);
	for (const heart of field.hearts) constrainHeart(field, heart);
	drawHeartPhysicsField(field);

	const isQuiet = field.hearts.every(
		(heart) => Math.abs(heart.vx) + Math.abs(heart.vy) < 0.042,
	);
	field.settledFrames = isQuiet ? field.settledFrames + 1 : 0;
	if (field.stepCount < 720 && field.settledFrames < 54) {
		field.frameId = requestAnimationFrame((time) =>
			animateHeartPhysicsField(field, time),
		);
	} else {
		field.frameId = 0;
		field.canvas.dataset.heartRunning = "false";
	}
}

function wakeHeartPhysicsField(field: HeartPhysicsField): void {
	field.stepCount = 0;
	field.settledFrames = 0;
	field.lastFrame = performance.now();
	field.canvas.dataset.heartRunning = "true";
	if (field.frameId === 0)
		field.frameId = requestAnimationFrame((time) =>
			animateHeartPhysicsField(field, time),
		);
}

function createHeart(field: HeartPhysicsField): HeartParticle {
	const radius = 5.5 + Math.random() * 4;
	return {
		x: field.width / 2 + (Math.random() - 0.5) * field.width * 0.4,
		y: -radius - Math.random() * 10,
		vx: (Math.random() - 0.5) * 0.09,
		vy: 0.01 + Math.random() * 0.025,
		radius,
		rotation: (Math.random() - 0.5) * 0.8,
		angularVelocity: (Math.random() - 0.5) * 0.004,
	};
}

function buildReducedMotionPile(field: HeartPhysicsField): void {
	field.hearts.length = 0;
	const columns = Math.max(4, Math.floor(field.width / 18));
	for (let index = 0; index < field.desiredCount; index += 1) {
		const radius = 6 + ((index * 17) % 28) / 10;
		const column = index % columns;
		const row = Math.floor(index / columns);
		const lane = field.width / columns;
		field.hearts.push({
			x: lane * (column + 0.5) + (((index * 13) % 7) - 3),
			y: field.height - radius - row * 12,
			vx: 0,
			vy: 0,
			radius,
			rotation: ((((index * 29) % 31) - 15) * Math.PI) / 180,
			angularVelocity: 0,
		});
	}
	drawHeartPhysicsField(field);
}

function scheduleHeartSpawns(field: HeartPhysicsField): void {
	window.clearTimeout(field.spawnTimer);
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		buildReducedMotionPile(field);
		return;
	}

	if (field.hearts.length > field.desiredCount) {
		field.hearts.splice(field.desiredCount);
		drawHeartPhysicsField(field);
	}
	if (field.hearts.length >= field.desiredCount) return;

	const spawnNext = () => {
		if (!field.canvas.isConnected || field.hearts.length >= field.desiredCount)
			return;
		field.hearts.push(createHeart(field));
		wakeHeartPhysicsField(field);
		if (field.hearts.length < field.desiredCount)
			field.spawnTimer = window.setTimeout(spawnNext, 105);
	};
	spawnNext();
}

function ensureHeartPhysicsGlobals(): void {
	if (heartPhysicsGlobalsReady) return;
	heartPhysicsGlobalsReady = true;
	window.addEventListener("resize", () => {
		purgeHeartPhysicsFields();
		for (const field of activeHeartPhysicsFields) {
			resizeHeartPhysicsField(field);
			field.desiredCount = heartVisualCount(field, field.rawCount);
			scheduleHeartSpawns(field);
			if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
				wakeHeartPhysicsField(field);
		}
	});
	new MutationObserver(() => {
		purgeHeartPhysicsFields();
		for (const field of activeHeartPhysicsFields) drawHeartPhysicsField(field);
	}).observe(document.documentElement, {
		attributes: true,
		attributeFilter: [
			"class",
			"data-theme",
			"data-accent-light",
			"data-accent-dark",
		],
	});
}

function getHeartPhysicsField(shell: HTMLElement): HeartPhysicsField | null {
	const canvas =
		shell.querySelector<HTMLCanvasElement>("[data-heart-physics]") ??
		shell
			.closest<HTMLElement>(".friend-wall__affection")
			?.querySelector<HTMLCanvasElement>("[data-heart-physics]");
	if (!canvas) return null;
	const existing = heartPhysicsFields.get(canvas);
	if (existing) return existing;
	const context = canvas.getContext("2d");
	if (!context) return null;
	const field: HeartPhysicsField = {
		canvas,
		context,
		hearts: [],
		rawCount: 0,
		desiredCount: 0,
		width: 0,
		height: 0,
		dpr: 1,
		frameId: 0,
		spawnTimer: 0,
		lastFrame: 0,
		stepCount: 0,
		settledFrames: 0,
	};
	heartPhysicsFields.set(canvas, field);
	activeHeartPhysicsFields.add(field);
	ensureHeartPhysicsGlobals();
	resizeHeartPhysicsField(field);
	return field;
}

function heartVisualCount(field: HeartPhysicsField, rawCount: number): number {
	const capacity = Math.max(
		12,
		Math.min(
			HEART_VISUAL_LIMIT,
			Math.floor((field.width * field.height) / 180),
		),
	);
	return Math.min(capacity, Math.max(0, Math.floor(rawCount)));
}

function syncHeartPhysics(shell: HTMLElement, rawCount: number): void {
	const field = getHeartPhysicsField(shell);
	if (!field) return;
	field.rawCount = rawCount;
	field.desiredCount = heartVisualCount(field, rawCount);
	scheduleHeartSpawns(field);
}

function runLikeEffect(shell: HTMLElement): void {
	pulseLike(shell);
}

function setTransientStatus(
	element: HTMLElement | null,
	message: string,
): void {
	if (!element) return;
	element.textContent = message;
	setTimeout(() => {
		if (element.textContent === message) element.textContent = "";
	}, 2400);
}

async function initializeLikes(): Promise<void> {
	const shells = [
		...document.querySelectorAll<HTMLElement>("[data-community-like]"),
	];
	if (shells.length === 0) return;
	const targets = [
		...new Set(
			shells.map((shell) => shell.dataset.communityLike).filter(Boolean),
		),
	] as string[];
	const params = new URLSearchParams();
	for (const target of targets) params.append("targets", target);

	try {
		const result = await readJson<LikesResponse>(
			await fetch(`${API_BASE}/blog/community/likes?${params}`, {
				headers: clientHeaders(),
			}),
		);
		for (const [target, state] of Object.entries(result.likes))
			setLikeState(target, state);
	} catch (error) {
		console.warn("[blog community] failed to load likes", error);
		for (const shell of shells) {
			const count = shell.querySelector<HTMLElement>("[data-like-count]");
			if (count) count.textContent = "0";
			if (
				shell.dataset.likeVariant === "about" ||
				shell.dataset.likeVariant === "friends"
			)
				syncHeartPhysics(shell, 0);
		}
	}

	for (const shell of shells) {
		if (shell.dataset.communityBound === "true") continue;
		shell.dataset.communityBound = "true";
		const target = shell.dataset.communityLike;
		const button = shell.querySelector<HTMLButtonElement>(
			".community-like__button",
		);
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
				setLikeState(result.target, {
					count: result.count,
					liked: result.liked,
				});
				if (result.liked) runLikeEffect(shell);
				else pulseLike(shell);
				setTransientStatus(
					status,
					result.liked ? "收到这颗心了" : "已经轻轻收回",
				);
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
	for (const character of value)
		hash = (hash * 31 + (character.codePointAt(0) || 0)) >>> 0;
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
	const name = comment.website
		? document.createElement("a")
		: document.createElement("strong");
	name.className = "community-comment__name";
	name.textContent = comment.nickname;
	if (name instanceof HTMLAnchorElement) {
		name.href = comment.website;
		name.target = "_blank";
		name.rel = "noopener noreferrer nofollow ugc";
	}
	if (comment.is_admin) {
		const badge = document.createElement("span");
		badge.className = "community-comment__owner-badge";
		badge.textContent = "站长";
		name.append(badge);
	}
	return name;
}

function buildComment(
	comment: PublicComment,
	onReply: (comment: PublicComment) => void,
	isAdmin: boolean,
	onDelete: (comment: PublicComment) => void,
): HTMLElement {
	const article = document.createElement("article");
	article.className = "community-comment";
	article.dataset.commentId = String(comment.id);

	const main = document.createElement("div");
	main.className = "community-comment__main";
	const avatar = document.createElement("span");
	avatar.className = "community-comment__avatar";
	avatar.style.setProperty("--avatar-hue", String(avatarHue(comment.nickname)));
	avatar.style.setProperty(
		"--avatar-angle",
		`${((comment.id % 5) - 2) * 0.8}deg`,
	);
	const fallback = document.createElement("span");
	fallback.className = "community-comment__avatar-fallback";
	fallback.textContent = initials(comment.nickname);
	const image = document.createElement("img");
	image.alt = "";
	image.loading = "lazy";
	image.decoding = "async";
	image.draggable = false;
	image.referrerPolicy = "no-referrer";
	image.dataset.avatarStage = "qq-or-gravatar";
	image.src = `${API_BASE}/blog/community/avatar/${comment.id}`;
	image.addEventListener("load", () => {
		fallback.hidden = true;
	});
	image.addEventListener("error", () => {
		const stage = image.dataset.avatarStage;
		if (stage === "qq-or-gravatar") {
			image.dataset.avatarStage = "gravatar";
			image.src = `${API_BASE}/blog/community/avatar/${comment.id}?fallback=1`;
		} else if (stage === "gravatar") {
			image.dataset.avatarStage = "local";
			image.src = `${API_BASE}/blog/community/avatar/${comment.id}?fallback=2`;
		} else {
			image.remove();
			fallback.hidden = false;
		}
	});
	fallback.hidden = false;
	avatar.append(fallback, image);

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
	if (isAdmin && comment.status && comment.status !== "published") {
		const status = document.createElement("span");
		status.className = "community-comment__status";
		status.textContent = comment.status === "pending" ? "待审核" : "已拒绝";
		meta.append(status);
	}

	const content = document.createElement("p");
	content.className = "community-comment__content";
	content.textContent = comment.content;
	const reply = document.createElement("button");
	reply.type = "button";
	reply.className = "community-comment__reply-button";
	reply.textContent = "↳ 回复";
	reply.setAttribute("aria-expanded", "false");
	reply.addEventListener("click", () => onReply(comment));
	const tools = document.createElement("span");
	tools.className = "community-comment__admin-tools";
	if (isAdmin) {
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "community-comment__delete";
		remove.textContent = "删除";
		remove.addEventListener("click", () => onDelete(comment));
		tools.append(remove);
	}
	meta.append(tools);
	body.append(meta, content, reply);
	main.append(avatar, body);
	article.append(main);
	return article;
}

function renderComments(
	section: HTMLElement,
	comments: PublicComment[],
	onReply: (comment: PublicComment) => void,
	isAdmin: boolean,
	onDelete: (comment: PublicComment) => void,
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
		const rootElement = buildComment(root, onReply, isAdmin, onDelete);
		const children = replies.get(root.id) || [];
		if (children.length > 0) {
			const replyList = document.createElement("div");
			replyList.className = "community-comment__replies";
			for (const child of children)
				replyList.append(buildComment(child, onReply, isAdmin, onDelete));
			rootElement.append(replyList);
		}
		list.append(rootElement);
	}
}

function readProfile(): CommentProfile {
	try {
		return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") as Record<
			string,
			string
		>;
	} catch {
		return {};
	}
}

function saveProfile(profile: CommentProfile): void {
	try {
		localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
	} catch {
		/* Local storage can be unavailable in private or restricted contexts. */
	}
}

function readAdminSecret(): string {
	try {
		return localStorage.getItem(ADMIN_KEY) || "";
	} catch {
		return "";
	}
}

function saveAdminSecret(secret: string): void {
	try {
		localStorage.setItem(ADMIN_KEY, secret);
	} catch {
		/* Keep the current page session even when storage is unavailable. */
	}
}

function clearAdminSecret(): void {
	try {
		localStorage.removeItem(ADMIN_KEY);
	} catch {
		/* Ignore storage cleanup failures. */
	}
}

async function verifyAdminSecret(secret: string): Promise<boolean> {
	const trimmed = secret.trim();
	if (!trimmed) return false;
	const response = await fetch(
		`${API_BASE}/calendar/events?secret=${encodeURIComponent(trimmed)}`,
		{
			method: "POST",
			headers: clientHeaders(true),
			body: JSON.stringify({
				action: "update",
				event: { id: "__verify_admin_secret__" },
			}),
		},
	);
	let data: { code?: string } = {};
	try {
		data = (await response.json()) as { code?: string };
	} catch {
		/* ignore malformed auth response */
	}
	return response.ok && data.code !== "not authorized";
}

async function initializeCommentSection(section: HTMLElement): Promise<void> {
	if (section.dataset.communityBound === "true") return;
	section.dataset.communityBound = "true";
	const page = section.dataset.communityComments;
	const form = section.querySelector<HTMLFormElement>("[data-comment-form]");
	const list = section.querySelector<HTMLElement>("[data-comment-list]");
	if (!page || !form || !list) return;
	const description = section.querySelector<HTMLElement>(
		"[data-comment-description]",
	);
	const openComment = section.querySelector<HTMLButtonElement>(
		"[data-open-comment]",
	);
	const openAdmin =
		section.querySelector<HTMLButtonElement>("[data-open-admin]");
	const adminDialog = section.querySelector<HTMLDialogElement>(
		"[data-admin-dialog]",
	);
	const adminForm = section.querySelector<HTMLFormElement>("[data-admin-form]");
	const adminInput = adminForm?.elements.namedItem("secret");
	const adminStatus = section.querySelector<HTMLElement>("[data-admin-status]");
	const adminLogout = section.querySelector<HTMLButtonElement>(
		"[data-admin-logout]",
	);
	let adminSecret = readAdminSecret();
	let adminMode = false;
	let activeReplyForm: HTMLFormElement | null = null;
	let activeReplyId: number | null = null;

	const closeInlineReply = () => {
		activeReplyForm?.remove();
		activeReplyForm = null;
		activeReplyId = null;
		for (const button of section.querySelectorAll<HTMLButtonElement>(
			".community-comment__reply-button",
		))
			button.setAttribute("aria-expanded", "false");
	};

	const setComposerOpen = (open: boolean, focus = false) => {
		form.hidden = !open;
		form.setAttribute("aria-hidden", String(!open));
		if (description) description.hidden = !open;
		openComment?.setAttribute("aria-expanded", String(open));
		if (
			open &&
			focus &&
			form.elements.namedItem("content") instanceof HTMLTextAreaElement
		) {
			(form.elements.namedItem("content") as HTMLTextAreaElement).focus();
		}
	};
	setComposerOpen(false);
	openComment?.addEventListener("click", () => {
		const next = Boolean(form.hidden);
		if (next) closeInlineReply();
		setComposerOpen(next, next);
	});

	const updateAdminControls = () => {
		openAdmin?.classList.toggle("is-active", adminMode);
		openAdmin?.setAttribute(
			"aria-label",
			adminMode ? "站长模式" : "管理员模式",
		);
		if (adminInput instanceof HTMLInputElement) adminInput.value = adminSecret;
		if (adminLogout) adminLogout.hidden = !adminMode;
		const submit = adminForm?.querySelector<HTMLButtonElement>(
			"button[type='submit']",
		);
		if (submit) submit.textContent = adminMode ? "已验证" : "验证密钥 ↗";
	};
	updateAdminControls();

	openAdmin?.addEventListener("click", () => {
		updateAdminControls();
		if (adminDialog && !adminDialog.open) adminDialog.showModal();
		if (adminInput instanceof HTMLInputElement && !adminInput.value)
			adminInput.focus();
	});
	section
		.querySelector<HTMLButtonElement>("[data-close-admin]")
		?.addEventListener("click", () => adminDialog?.close());
	adminDialog?.addEventListener("click", (event) => {
		if (event.target === adminDialog) adminDialog.close();
	});
	adminLogout?.addEventListener("click", () => {
		clearAdminSecret();
		adminSecret = "";
		adminMode = false;
		updateAdminControls();
		void load();
		if (adminStatus) adminStatus.textContent = "已退出站长模式";
	});
	adminForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (
			!adminForm.reportValidity() ||
			!(adminInput instanceof HTMLInputElement)
		)
			return;
		const secret = adminInput.value.trim();
		const submit = adminForm.querySelector<HTMLButtonElement>(
			"button[type='submit']",
		);
		if (submit) submit.disabled = true;
		if (adminStatus) {
			adminStatus.dataset.state = "busy";
			adminStatus.textContent = "正在验证…";
		}
		try {
			if (!(await verifyAdminSecret(secret)))
				throw new Error("管理员密钥不正确");
			saveAdminSecret(secret);
			adminSecret = secret;
			adminMode = true;
			updateAdminControls();
			if (adminStatus) {
				adminStatus.dataset.state = "success";
				adminStatus.textContent = "站长模式已开启";
			}
			adminDialog?.close();
			closeInlineReply();
			setComposerOpen(true, true);
			await load();
		} catch (error) {
			if (adminStatus) {
				adminStatus.dataset.state = "error";
				adminStatus.textContent =
					error instanceof Error ? error.message : "管理员验证失败";
			}
		} finally {
			if (submit) submit.disabled = false;
		}
	});

	const profile = readProfile();
	for (const field of ["nickname", "email", "website"] as const) {
		const input = form.elements.namedItem(field);
		if (input instanceof HTMLInputElement && profile[field])
			input.value = profile[field] || "";
	}
	const content = form.elements.namedItem("content");
	const contentCount = section.querySelector<HTMLElement>(
		"[data-content-count]",
	);
	if (content instanceof HTMLTextAreaElement && contentCount) {
		const updateCount = () => {
			contentCount.textContent = String(content.value.length);
		};
		content.addEventListener("input", updateCount);
		updateCount();
	}

	const submitComment = async (
		payload: CommentPayload,
	): Promise<SubmitResponse> =>
		readJson<SubmitResponse>(
			await fetch(`${API_BASE}/blog/community/comments/${page}`, {
				method: "POST",
				headers:
					adminMode && adminSecret
						? adminHeaders(adminSecret, true)
						: clientHeaders(true),
				body: JSON.stringify(payload),
			}),
		);

	const makeIdentityField = (
		labelText: string,
		name: "nickname" | "email" | "website",
		type: "text" | "email" | "url",
		placeholder: string,
		value: string,
		required = false,
	): HTMLLabelElement => {
		const label = document.createElement("label");
		const caption = document.createElement("span");
		caption.textContent = labelText;
		if (required) {
			const mark = document.createElement("b");
			mark.setAttribute("aria-hidden", "true");
			mark.textContent = " *";
			caption.append(mark);
		}
		const input = document.createElement("input");
		input.name = name;
		input.type = type;
		input.placeholder = placeholder;
		input.value = value;
		input.required = required;
		input.maxLength = name === "nickname" ? 30 : name === "email" ? 254 : 300;
		input.setAttribute(
			"autocomplete",
			name === "nickname" ? "nickname" : name === "email" ? "email" : "url",
		);
		label.append(caption, input);
		return label;
	};

	const openInlineReply = (comment: PublicComment) => {
		if (activeReplyId === comment.id) {
			closeInlineReply();
			return;
		}
		closeInlineReply();
		setComposerOpen(false);

		const target = [
			...section.querySelectorAll<HTMLElement>("[data-comment-id]"),
		].find((element) => element.dataset.commentId === String(comment.id));
		const targetMain = target?.querySelector<HTMLElement>(
			":scope > .community-comment__main",
		);
		if (!target || !targetMain) return;

		const profile = readProfile();
		const compact = Boolean(profile.nickname?.trim() && profile.email?.trim());
		const replyForm = document.createElement("form");
		replyForm.className = "community-inline-reply";
		replyForm.dataset.replyTo = String(comment.id);
		replyForm.noValidate = true;
		replyForm.setAttribute("aria-label", `回复 ${comment.nickname}`);

		const heading = document.createElement("div");
		heading.className = "community-inline-reply__heading";
		const headingText = document.createElement("div");
		const title = document.createElement("strong");
		title.textContent = `回复 @${comment.nickname}`;
		const marker = document.createElement("small");
		marker.textContent = compact ? `AS ${profile.nickname}` : "REPLY";
		headingText.append(title, marker);
		const close = document.createElement("button");
		close.type = "button";
		close.className = "community-inline-reply__close";
		close.setAttribute("aria-label", "取消回复");
		close.textContent = "×";
		close.addEventListener("click", closeInlineReply);
		heading.append(headingText, close);
		replyForm.append(heading);

		if (!compact) {
			const identity = document.createElement("div");
			identity.className = "community-inline-reply__identity";
			identity.append(
				makeIdentityField(
					"昵称",
					"nickname",
					"text",
					"怎么称呼你",
					profile.nickname || "",
					true,
				),
				makeIdentityField(
					"邮箱",
					"email",
					"email",
					"不会在页面公开",
					profile.email || "",
					true,
				),
				makeIdentityField(
					"网站",
					"website",
					"url",
					"https://（可选）",
					profile.website || "",
				),
			);
			replyForm.append(identity);
		}

		const contentLabel = document.createElement("label");
		contentLabel.className = "community-inline-reply__content";
		const contentCaption = document.createElement("span");
		contentCaption.textContent = "回复内容";
		const contentMark = document.createElement("b");
		contentMark.setAttribute("aria-hidden", "true");
		contentMark.textContent = " *";
		contentCaption.append(contentMark);
		const replyContent = document.createElement("textarea");
		replyContent.name = "content";
		replyContent.required = true;
		replyContent.maxLength = 800;
		replyContent.rows = compact ? 3 : 4;
		replyContent.placeholder = `写下给 @${comment.nickname} 的回复…`;
		const counter = document.createElement("small");
		counter.textContent = "0 / 800";
		replyContent.addEventListener("input", () => {
			counter.textContent = `${replyContent.value.length} / 800`;
		});
		contentLabel.append(contentCaption, replyContent, counter);
		replyForm.append(contentLabel);

		const footer = document.createElement("div");
		footer.className = "community-inline-reply__footer";
		const status = document.createElement("p");
		status.className = "community-inline-reply__status";
		status.setAttribute("aria-live", "polite");
		const actions = document.createElement("div");
		actions.className = "community-inline-reply__actions";
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.textContent = "取消";
		cancel.addEventListener("click", closeInlineReply);
		const submit = document.createElement("button");
		submit.type = "submit";
		submit.textContent = "提交回复 ↗";
		actions.append(cancel, submit);
		footer.append(status, actions);
		replyForm.append(footer);

		replyForm.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (!replyForm.reportValidity()) return;
			const data = new FormData(replyForm);
			const payload: CommentPayload = {
				parent_id: comment.id,
				nickname: String(
					compact ? profile.nickname || "" : data.get("nickname") || "",
				).trim(),
				email: String(
					compact ? profile.email || "" : data.get("email") || "",
				).trim(),
				website: String(
					compact ? profile.website || "" : data.get("website") || "",
				).trim(),
				content: String(data.get("content") || "").trim(),
			};
			submit.disabled = true;
			status.dataset.state = "busy";
			status.textContent = "正在检查这条回复…";
			try {
				const result = await submitComment(payload);
				saveProfile({
					nickname: payload.nickname,
					email: payload.email,
					website: payload.website,
				});
				replyContent.value = "";
				counter.textContent = "0 / 800";
				status.dataset.state = "success";
				status.textContent = result.message || "回复已提交";
				if (result.status === "published" || adminMode) {
					closeInlineReply();
					await load();
				}
			} catch (error) {
				status.dataset.state = "error";
				status.textContent =
					error instanceof Error ? error.message : "回复提交失败";
			} finally {
				submit.disabled = false;
			}
		});

		activeReplyForm = replyForm;
		activeReplyId = comment.id;
		targetMain.after(replyForm);
		target
			.querySelector<HTMLButtonElement>(".community-comment__reply-button")
			?.setAttribute("aria-expanded", "true");
		replyForm.scrollIntoView({
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "auto"
				: "smooth",
			block: "nearest",
		});
		window.setTimeout(() => {
			if (replyContent.isConnected) replyContent.focus({ preventScroll: true });
		}, 180);
	};

	const load = async () => {
		try {
			const result = await readJson<CommentsResponse>(
				await fetch(`${API_BASE}/blog/community/comments/${page}`, {
					headers:
						adminMode && adminSecret
							? adminHeaders(adminSecret)
							: clientHeaders(),
				}),
			);
			if (section.isConnected) {
				closeInlineReply();
				renderComments(
					section,
					result.comments,
					openInlineReply,
					adminMode,
					onDelete,
				);
			}
		} catch (error) {
			console.warn("[blog community] failed to load comments", error);
			if (section.isConnected)
				list.textContent = "留言暂时没有接通，稍后再来看看。";
		}
	};
	const onDelete = async (comment: PublicComment) => {
		if (
			!adminMode ||
			!adminSecret ||
			!window.confirm("确定删除这条评论及其回复吗？")
		)
			return;
		try {
			await readJson<{ success: boolean }>(
				await fetch(`${API_BASE}/blog/community/comments/${comment.id}`, {
					method: "DELETE",
					headers: adminHeaders(adminSecret),
				}),
			);
			await load();
		} catch (error) {
			if (adminStatus)
				adminStatus.textContent =
					error instanceof Error ? error.message : "删除失败";
		}
	};
	const restoreAdminSession = async () => {
		if (adminSecret) {
			try {
				if (await verifyAdminSecret(adminSecret)) {
					adminMode = true;
					updateAdminControls();
					if (adminStatus) {
						adminStatus.dataset.state = "success";
						adminStatus.textContent = "站长模式已恢复";
					}
				} else {
					clearAdminSecret();
					adminSecret = "";
					adminMode = false;
					updateAdminControls();
					if (adminStatus) {
						adminStatus.dataset.state = "error";
						adminStatus.textContent = "管理员密钥已失效，请重新验证";
					}
				}
			} catch {
				// Keep the cached secret for a later retry when the API is temporarily unavailable.
				adminMode = false;
				updateAdminControls();
			}
		}
		await load();
	};
	void restoreAdminSession();

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!form.reportValidity()) return;
		const submit = form.querySelector<HTMLButtonElement>(
			"button[type='submit']",
		);
		const status = section.querySelector<HTMLElement>(
			"[data-comment-form-status]",
		);
		const data = new FormData(form);
		const payload: CommentPayload = {
			parent_id: null,
			nickname: String(data.get("nickname") || "").trim(),
			email: String(data.get("email") || "").trim(),
			website: String(data.get("website") || "").trim(),
			content: String(data.get("content") || "").trim(),
		};
		if (submit) submit.disabled = true;
		if (status) {
			status.dataset.state = "busy";
			status.textContent = "正在检查这条留言…";
		}
		try {
			const result = await submitComment(payload);
			saveProfile({
				nickname: payload.nickname,
				email: payload.email,
				website: payload.website,
			});
			if (content instanceof HTMLTextAreaElement) content.value = "";
			if (contentCount) contentCount.textContent = "0";
			if (status) {
				status.dataset.state = "success";
				status.textContent = result.message || "评论已提交";
			}
			if (result.status === "published" || adminMode) await load();
		} catch (error) {
			if (status) {
				status.dataset.state = "error";
				status.textContent =
					error instanceof Error ? error.message : "评论提交失败";
			}
		} finally {
			if (submit) submit.disabled = false;
		}
	});
}

function initializeComments(): void {
	for (const section of document.querySelectorAll<HTMLElement>(
		"[data-community-comments]",
	)) {
		void initializeCommentSection(section);
	}
}

function initializeFriendApplications(): void {
	const dialog = document.querySelector<HTMLDialogElement>(
		"[data-friend-apply-dialog]",
	);
	if (!dialog) return;
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let closeTimer: number | undefined;
	const finishClose = (): void => {
		if (closeTimer !== undefined) {
			window.clearTimeout(closeTimer);
			closeTimer = undefined;
		}
		dialog.classList.remove("is-visible", "is-closing");
		if (dialog.open) dialog.close();
	};
	const closeFriendDialog = (): void => {
		if (!dialog.open || dialog.classList.contains("is-closing")) return;
		dialog.classList.remove("is-visible");
		if (reducedMotion.matches) {
			finishClose();
			return;
		}
		dialog.classList.add("is-closing");
		closeTimer = window.setTimeout(finishClose, 320);
	};
	const openFriendDialog = (): void => {
		if (dialog.open) return;
		if (closeTimer !== undefined) {
			window.clearTimeout(closeTimer);
			closeTimer = undefined;
		}
		dialog.classList.remove("is-visible", "is-closing");
		dialog.showModal();
		if (reducedMotion.matches) {
			dialog.classList.add("is-visible");
			return;
		}
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (dialog.open) dialog.classList.add("is-visible");
			});
		});
	};
	for (const opener of document.querySelectorAll<HTMLButtonElement>(
		"[data-open-friend-apply]",
	)) {
		if (opener.dataset.friendApplyBound === "true") continue;
		opener.dataset.friendApplyBound = "true";
		opener.addEventListener("click", openFriendDialog);
	}
	if (dialog.dataset.friendApplyBound === "true") return;
	dialog.dataset.friendApplyBound = "true";
	for (const button of dialog.querySelectorAll<HTMLButtonElement>(
		"[data-copy-value]",
	)) {
		button.addEventListener("click", async () => {
			const value = button.dataset.copyValue || "";
			if (!value) return;
			try {
				await navigator.clipboard.writeText(value);
				button.classList.add("is-copied");
				const previousLabel = button.getAttribute("aria-label");
				button.setAttribute("aria-label", "已复制");
				setTimeout(() => {
					button.classList.remove("is-copied");
					if (previousLabel) button.setAttribute("aria-label", previousLabel);
					else button.removeAttribute("aria-label");
				}, 1400);
			} catch {
				button.setAttribute("aria-label", "复制失败，请手动复制");
			}
		});
	}
	dialog
		.querySelector<HTMLButtonElement>("[data-close-friend-apply]")
		?.addEventListener("click", closeFriendDialog);
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) closeFriendDialog();
	});
	dialog.addEventListener("cancel", (event) => {
		event.preventDefault();
		closeFriendDialog();
	});
	dialog.addEventListener("transitionend", (event) => {
		if (
			dialog.classList.contains("is-closing") &&
			event.target === dialog &&
			event.propertyName === "opacity"
		)
			finishClose();
	});
	const form = dialog.querySelector<HTMLFormElement>(
		"[data-friend-apply-form]",
	);
	if (!form) return;
	const status = form.querySelector<HTMLElement>("[data-friend-apply-status]");
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		if (!form.reportValidity()) return;
		const submit = form.querySelector<HTMLButtonElement>(
			"button[type='submit']",
		);
		const data = new FormData(form);
		const payload = {
			name: String(data.get("name") || ""),
			website: String(data.get("website") || ""),
			avatar: String(data.get("avatar") || ""),
			description: String(data.get("description") || ""),
			email: String(data.get("email") || ""),
		};
		if (submit) submit.disabled = true;
		if (status) {
			status.dataset.state = "busy";
			status.textContent = "正在提交申请…";
		}
		try {
			const result = await readJson<FriendApplicationResponse>(
				await fetch(`${API_BASE}/blog/community/friend-applications`, {
					method: "POST",
					headers: clientHeaders(true),
					body: JSON.stringify(payload),
				}),
			);
			form.reset();
			if (status) {
				status.dataset.state = "success";
				status.textContent = result.message || "申请已提交，等待审核";
			}
		} catch (error) {
			if (status) {
				status.dataset.state = "error";
				status.textContent =
					error instanceof Error ? error.message : "申请提交失败";
			}
		} finally {
			if (submit) submit.disabled = false;
		}
	});
}

let scheduledFrame: number | undefined;
function scheduleCommunity(): void {
	if (scheduledFrame !== undefined) cancelAnimationFrame(scheduledFrame);
	scheduledFrame = requestAnimationFrame(() => {
		scheduledFrame = undefined;
		void initializeLikes();
		initializeComments();
		initializeFriendApplications();
	});
}

if (document.readyState === "loading")
	document.addEventListener("DOMContentLoaded", scheduleCommunity, {
		once: true,
	});
else scheduleCommunity();

function registerSwupHook(): void {
	const swup = (
		window as Window & {
			swup?: { hooks?: { on: (name: string, callback: () => void) => void } };
		}
	).swup;
	swup?.hooks?.on("page:view", scheduleCommunity);
}

if ((window as Window & { swup?: unknown }).swup) registerSwupHook();
else document.addEventListener("swup:enable", registerSwupHook, { once: true });
