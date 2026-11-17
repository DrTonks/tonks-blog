let dismissTimer: ReturnType<typeof setTimeout> | undefined;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** One passive notification at a time; repeated actions renew its duration. */
export function showToast(message: string, duration = 3500) {
	const toast = document.getElementById("site-toast");
	const label = toast?.querySelector<HTMLElement>("[data-toast-message]");
	if (!toast || !label) return;
	clearTimeout(dismissTimer);
	clearTimeout(clearTimer);
	label.textContent = message;
	toast.setAttribute("data-visible", "");
	dismissTimer = setTimeout(() => {
		toast.removeAttribute("data-visible");
		clearTimer = setTimeout(() => { label.textContent = ""; }, 180);
	}, duration);
}
