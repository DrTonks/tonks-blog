(() => {
	if (window.clarity) return;
	const clarity = (...args) => (clarity.q ??= []).push(args);
	window.clarity = clarity;
	let scheduled = false;
	const start = () => {
		const script = document.createElement("script");
		script.setAttribute("data-swup-ignore-script", "");
		script.async = true;
		script.src = "https://www.clarity.ms/tag/tjr3vkhj8i";
		document.head.append(script);
	};
	const afterReveal = () => {
		if (scheduled) return;
		scheduled = true;
		clearTimeout(deadline);
		window.removeEventListener("tonks:initial-loader:done", afterReveal);
		requestAnimationFrame(() => requestAnimationFrame(() => {
			if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1000 });
			else setTimeout(start, 0);
		}));
	};
	const deadline = setTimeout(afterReveal, 22000);
	window.addEventListener("tonks:initial-loader:done", afterReveal, { once: true });
	const checkLoader = () => {
		if (!document.getElementById("initial-loading-screen")) afterReveal();
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", checkLoader, { once: true });
	else checkLoader();
})();
