// Delegate to the persistent document so this also works after Swup navigation.
const resetTimers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>();
document.addEventListener("click", async (event) => {
	const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-copy-rss]");
	const address = button?.dataset.copyRss;
	if (!button || !address) return;
	if (button.getAttribute("aria-busy") === "true") return;
	button.setAttribute("aria-busy", "true");
	clearTimeout(resetTimers.get(button));
	const feedback = button.closest(".card-base")?.querySelector<HTMLElement>("[data-rss-feedback]");
	let copied = false;
	try {
		await navigator.clipboard.writeText(address);
		copied = true;
	} catch {
		// Fallback for browsers without Clipboard API access; never report a failed copy as success.
		const input = document.createElement("textarea");
		input.value = address;
		input.style.cssText = "position:fixed;left:-9999px;top:0";
		document.body.append(input);
		input.select();
		try { copied = document.execCommand("copy"); } catch { /* Show a selectable URL below. */ }
		input.remove();
		button.focus({ preventScroll: true });
	}
	button.removeAttribute("aria-busy");
	if (copied) {
		button.dataset.copyState = "copied";
		button.title = "RSS 订阅地址已复制";
		button.setAttribute("aria-label", "RSS 订阅地址已复制");
		resetTimers.set(button, setTimeout(() => {
			delete button.dataset.copyState;
			button.title = "复制 RSS 订阅地址";
			button.setAttribute("aria-label", "复制 RSS 订阅地址");
			if (feedback) feedback.textContent = "";
			resetTimers.delete(button);
		}, 2000));
	} else {
		delete button.dataset.copyState;
		button.title = "复制 RSS 订阅地址";
		button.setAttribute("aria-label", "复制 RSS 订阅地址");
	}
	if (feedback) {
		feedback.classList.toggle("sr-only", copied);
		feedback.textContent = copied ? "RSS 订阅地址已复制" : `未能自动复制，请手动复制：${address}`;
	}
});
