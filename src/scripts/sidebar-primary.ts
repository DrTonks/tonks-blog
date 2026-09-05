let initialized = false;
let typingFrame = 0;
function stopTyping() { cancelAnimationFrame(typingFrame); typingFrame = 0; }
function startTyping() {
    stopTyping();
    const host = document.getElementById('sidebar-primary-widget');
    const text = host?.querySelector<HTMLElement>('[data-summary-typed]');
    if (!text || host?.dataset.mode !== 'summary') return;
    const characters = Array.from(host.dataset.summary || '');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { text.textContent = characters.join(''); return; }
    const started = performance.now();
    let previous = -1;
    const frame = (now: number) => {
        const count = Math.min(characters.length, Math.floor((now - started) / 18));
        if (count !== previous) { text.textContent = characters.slice(0, count).join('') + (count < characters.length ? '▍' : ''); previous = count; }
        if (count < characters.length) typingFrame = requestAnimationFrame(frame);
        else typingFrame = 0;
    };
    typingFrame = requestAnimationFrame(frame);
}

	export function syncPrimaryWidget() {
		const host = document.getElementById("sidebar-primary-widget");
		const sidebar = document.getElementById("sidebar");
		const profile = host?.querySelector<HTMLElement>("[data-sidebar-profile-panel]");
		const panel = host?.querySelector<HTMLElement>("[data-sidebar-summary-panel]");
		if (!host || !sidebar || !profile || !panel) return;
		const payload = document.getElementById("ai-summary-data");
		const summary = payload?.dataset.summary || "";
		const isArticle = Boolean(payload);
        const nextKey = isArticle ? summary : 'profile';
        const changed = host.dataset.contentKey !== nextKey;
        if (changed) {
            host.dataset.contentKey = nextKey;
            host.dataset.animateContent = 'true';
        }
		host.dataset.mode = isArticle ? "summary" : "profile";
		profile.hidden = isArticle;
		panel.hidden = !isArticle;
		profile.classList.remove("is-leaving", "is-entering");
		panel.classList.remove("is-leaving", "is-entering");
		sidebar.classList.toggle("sidebar-article-mode", isArticle);
		const card = panel.querySelector(".ai-summary-card");
		card?.classList.remove("is-typing");
		for (const element of panel.querySelectorAll('[data-ai-summary-accessible]')) element.textContent = summary;
        if (changed) {
            stopTyping();
            host.dataset.summary = summary;
            const visual = panel.querySelector<HTMLElement>('[data-ai-summary-visual]');
            if (visual) {
                const typed = document.createElement('span');
                typed.dataset.summaryTyped = '';
                visual.replaceChildren(typed);
            }
            if (!document.documentElement.classList.contains('is-changing')) requestAnimationFrame(startTyping);
        }
		const count = panel.querySelector("[data-ai-summary-count]");
		if (count) count.textContent = String(Array.from(summary).length) + " 字";
	}

export function initializePrimaryWidget() {
    if (initialized) return;
    initialized = true;
    const register = () => {
            window.swup?.hooks?.on('visit:start', (visit: {to: {url: string}}) => {
                stopTyping();
                const host = document.getElementById('sidebar-primary-widget');
                host?.querySelectorAll('[data-sidebar-profile-panel], [data-sidebar-summary-panel]').forEach(panel => panel.getAnimations().forEach(animation => animation.cancel()));
                if (host?.dataset.mode === 'summary' || new URL(visit.to.url, location.href).pathname.includes('/posts/')) host?.setAttribute('data-navigation-out', '');
            });
            window.swup?.hooks?.on("animation:in:start", () => {
                const host = document.getElementById('sidebar-primary-widget');
                host?.removeAttribute('data-navigation-out');
                if (host?.dataset.animateContent !== 'true') {
                    const text = host?.querySelector('[data-summary-typed]');
                    if (text) text.textContent = host?.dataset.summary || '';
                    return;
                }
                delete host.dataset.animateContent;
                startTyping();
                if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
                const panel = host.querySelector<HTMLElement>('[data-sidebar-profile-panel]:not([hidden]), [data-sidebar-summary-panel]:not([hidden])');
                panel?.getAnimations().forEach(animation => animation.cancel());
                panel?.animate([{opacity: 0, transform: 'translateY(1rem)'}, {opacity: 1, transform: 'none'}], {duration: 300, easing: 'ease-out'});
            });
    };
    if (window.swup) register();
    else document.addEventListener('swup:enable', register, {once:true});
}
