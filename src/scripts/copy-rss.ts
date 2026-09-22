// Delegate to the persistent document so this also works after Swup navigation.
document.addEventListener("click", async (event) => {
	const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-copy-rss]");
	const address = button?.dataset.copyRss;
	if (!button || !address) return;
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
	if (feedback) {
		feedback.hidden = false;
		feedback.textContent = copied ? "RSS 订阅地址已复制" : `未能自动复制，请手动复制：${address}`;
	}
});
