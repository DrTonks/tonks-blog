import mermaidRuntimeUrl from "../plugins/mermaid-render-script.js?url";

let cleanup: (() => void) | undefined;

export function initializeArticle() {
	cleanup?.();
	const controller = new AbortController();
	const { signal } = controller;
	const root = document.querySelector<HTMLElement>(".custom-md");
	if (!root) return;
	if (
		root.querySelector(".mermaid") &&
		!document.querySelector("script[data-article-mermaid]")
	) {
		const script = document.createElement("script");
		script.src = mermaidRuntimeUrl;
		script.dataset.articleMermaid = "true";
		script.onerror = () => script.remove();
		document.head.append(script);
	}
	const temporary: HTMLElement[] = [];
	let closeTimer = 0;
	cleanup = () => {
		controller.abort();
		clearTimeout(closeTimer);
		temporary.forEach((node) => node.remove());
		root.querySelectorAll("audio").forEach((audio) => audio.pause());
	};

	root
		.querySelectorAll<HTMLImageElement>(".article-figure img")
		.forEach((img) => {
			const figure = img.closest("figure")!;
			const settle = () => {
				figure.classList.remove("is-loading");
				figure.classList.toggle("is-error", !img.naturalWidth);
				figure.querySelector(".image-error")?.remove();
				if (!img.naturalWidth) {
					const message = document.createElement("span");
					message.className = "image-error";
					message.textContent = "图片暂时无法加载";
					figure.append(message);
				}
			};
			if (img.complete) settle();
			else {
				figure.classList.add("is-loading");
				img.addEventListener("load", settle, { signal, once: true });
				img.addEventListener("error", settle, { signal, once: true });
			}
		});

	root.querySelectorAll<HTMLElement>(".article-spoiler").forEach((spoiler) => {
		const trigger =
			spoiler.querySelector<HTMLButtonElement>(".spoiler-trigger")!;
		const content = spoiler.querySelector<HTMLElement>(".spoiler-content")!;
		let pinned = false;
		const reveal = (visible: boolean) => {
			spoiler.classList.toggle("is-revealed", visible);
			content.inert = !visible;
			content.setAttribute("aria-hidden", String(!visible));
			trigger.setAttribute("aria-expanded", String(visible));
		};
		const warning = spoiler.dataset.warning;
		spoiler.addEventListener(
			"click",
			(event) => {
				const target = event.target as Element;
				if (
					target.closest(".article-spoiler") === spoiler &&
					target !== trigger &&
					!target.closest("a, button, input, audio, video, summary, select, textarea, [contenteditable], [role=button], img")
				)
					trigger.click();
			},
			{ signal },
		);
		if (!warning) {
			spoiler.addEventListener(
				"pointerenter",
				(event) => {
					if (event.pointerType === "mouse") reveal(true);
				},
				{ signal },
			);
			spoiler.addEventListener(
				"pointerleave",
				() => {
					if (!pinned && !spoiler.contains(document.activeElement))
						reveal(false);
				},
				{ signal },
			);
			trigger.addEventListener("focus", () => reveal(true), { signal });
			spoiler.addEventListener(
				"focusout",
				(event) => {
					if (!pinned && !spoiler.contains(event.relatedTarget as Node))
						reveal(false);
				},
				{ signal },
			);
		}
		trigger.addEventListener(
			"click",
			() => {
				if (warning && pinned) return;
				if (!warning) {
					pinned = !pinned;
					reveal(pinned);
					return;
				}
				const dialog = document.createElement("dialog");
				dialog.className = "article-warning";
				const label = document.createElement("h2");
				label.textContent = "继续阅读之前";
				label.id = "article-warning-title";
				dialog.setAttribute("aria-labelledby", label.id);
				const message = document.createElement("p");
				message.textContent = warning;
				const actions = document.createElement("div");
				const cancel = document.createElement("button");
				cancel.textContent = "暂不查看";
				const confirm = document.createElement("button");
				confirm.textContent = "继续阅读";
				confirm.className = "confirm";
				actions.append(cancel, confirm);
				dialog.append(label, message, actions);
				document.body.append(dialog);
				temporary.push(dialog);
				cancel.onclick = () => dialog.close();
				confirm.onclick = () => {
					pinned = true;
					reveal(true);
					dialog.close();
				};
				dialog.addEventListener(
					"close",
					() => {
						dialog.remove();
						if (pinned) {
                            content.tabIndex = -1;
                            content.focus({ preventScroll: true });
                        } else trigger.focus({ preventScroll: true });
					},
					{ once: true },
				);
				dialog.showModal();
				cancel.focus();
			},
			{ signal },
		);
	});

	const popup = document.createElement("div");
	popup.className = "article-footnote-popup";
	popup.id = "article-footnote-popup";
	popup.tabIndex = -1;
	popup.hidden = true;
	popup.setAttribute("role", "region");
	popup.setAttribute("aria-label", "脚注");
	document.body.append(popup);
	temporary.push(popup);
	root.classList.add("has-footnote-previews");
	let active: HTMLAnchorElement | undefined;
	const hide = () => {
		popup.hidden = true;
		active?.setAttribute("aria-expanded", "false");
		active = undefined;
	};
	const positionPopup = () => {
		if (!active || popup.hidden) return;
		const rect = active.getBoundingClientRect();
		if (rect.bottom < 0 || rect.top > innerHeight) {
			hide();
			return;
		}
		popup.style.left = `${Math.max(12, Math.min(rect.left - 24, innerWidth - popup.offsetWidth - 12))}px`;
		const height = popup.offsetHeight;
		popup.style.top = `${Math.max(12, rect.top > height + 20 ? rect.top - height - 10 : Math.min(rect.bottom + 10, innerHeight - height - 12))}px`;
	};
	const later = () => {
		clearTimeout(closeTimer);
		closeTimer = window.setTimeout(hide, 180);
	};
	popup.addEventListener("pointerenter", () => clearTimeout(closeTimer), {
		signal,
	});
	popup.addEventListener("pointerleave", later, { signal });
	popup.addEventListener("focusin", () => clearTimeout(closeTimer), { signal });
	popup.addEventListener(
		"focusout",
		(event) => {
			if (!popup.contains(event.relatedTarget as Node)) later();
		},
		{ signal },
	);
	root
		.querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]")
		.forEach((ref) => {
			ref.setAttribute("aria-controls", popup.id);
			ref.setAttribute("aria-expanded", "false");
			ref.setAttribute("aria-keyshortcuts", "ArrowDown");
			const show = () => {
				clearTimeout(closeTimer);
				const target = document.getElementById(
					decodeURIComponent(ref.hash.slice(1)),
				);
				if (!target) return;
				if (active !== ref) hide();
				active = ref;
				const copy = target.cloneNode(true) as HTMLElement;
				copy
					.querySelectorAll("[data-footnote-backref]")
					.forEach((node) => node.remove());
				copy.removeAttribute("id");
				copy
					.querySelectorAll("[id]")
					.forEach((node) => node.removeAttribute("id"));
				popup.replaceChildren(...Array.from(copy.childNodes));
				popup.hidden = false;
				ref.setAttribute("aria-expanded", "true");
				positionPopup();
			};
			ref.addEventListener("pointerenter", show, { signal });
			ref.addEventListener("pointerleave", later, { signal });
			ref.addEventListener("focus", show, { signal });
			ref.addEventListener("blur", later, { signal });
			ref.addEventListener(
				"click",
				(event) => {
					event.preventDefault();
					show();
				},
				{ signal },
			);
			ref.addEventListener(
				"keydown",
				(event) => {
					if (event.key === "ArrowDown") {
						event.preventDefault();
						show();
						popup.focus({ preventScroll: true });
					}
				},
				{ signal },
			);
		});
	document.addEventListener(
		"pointerdown",
		(event) => {
			if (
				!popup.contains(event.target as Node) &&
				!(event.target as Element).closest("[data-footnote-ref]")
			)
				hide();
		},
		{ signal },
	);
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape") {
				const ref = active;
				hide();
				ref?.focus({ preventScroll: true });
				hide();
			}
		},
		{ signal },
	);
	window.addEventListener("scroll", positionPopup, { signal, passive: true });
	window.addEventListener("resize", positionPopup, { signal, passive: true });
	document.addEventListener(
		"astro:before-swap",
		() => root.querySelectorAll("audio").forEach((audio) => audio.pause()),
		{ signal },
	);
}
