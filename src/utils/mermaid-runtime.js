// Mermaid has shared configuration. Serialize initialization + rendering,
// including work left over from an article that was just navigated away from.
let renderQueue = Promise.resolve();
let nextId = 0;
const fontFamily = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';

export function diagramTheme(root) {
	const doc = root.ownerDocument;
	const dark = doc.documentElement.classList.contains("dark");
	const probe = doc.createElement("span");
	// The blog animates text colors globally. Sampling a transitioning probe
	// would incorrectly reuse the first (accent) color for backgrounds and text.
	probe.style.cssText = "position:absolute;visibility:hidden;transition:none!important;animation:none!important";
	root.append(probe);
	const canvas = doc.createElement("canvas");
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	const color = (variable, fallback) => {
		probe.style.color = `var(${variable}, ${fallback})`;
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = doc.defaultView.getComputedStyle(probe).color;
		ctx.fillRect(0, 0, 1, 1);
		return "#" + [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v.toString(16).padStart(2, "0")).join("");
	};
	try {
		const accent = color("--primary", dark ? "#82b5f1" : "#4a9cef");
		const surface = color("--card-bg", dark ? "#202429" : "#ffffff");
		const soft = color("--btn-regular-bg", dark ? "#293746" : "#edf5ff");
		const text = color("--tw-prose-body", dark ? "#d1d5db" : "#334155");
		return {
			startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true,
			secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges", "suppressErrorRendering"],
			maxTextSize: 50000, maxEdges: 500, theme: "base", fontFamily,
			// SVG text avoids foreignObject layout differences between Safari and Obsidian.
			htmlLabels: false, flowchart: { htmlLabels: false, useMaxWidth: false },
			themeVariables: {
				darkMode: dark, fontFamily, fontSize: "16px", background: surface,
				primaryColor: soft, primaryTextColor: text, primaryBorderColor: accent,
				secondaryColor: surface, secondaryTextColor: text, secondaryBorderColor: accent,
				tertiaryColor: soft, tertiaryTextColor: text, tertiaryBorderColor: accent,
				lineColor: accent, textColor: text, mainBkg: soft, nodeBorder: accent,
				clusterBkg: surface, clusterBorder: accent, edgeLabelBackground: surface,
				actorBkg: soft, actorBorder: accent, actorTextColor: text,
				actorLineColor: accent, signalColor: text, signalTextColor: text,
				labelBoxBkgColor: soft, labelBoxBorderColor: accent, labelTextColor: text,
				noteBkgColor: soft, noteBorderColor: accent, noteTextColor: text,
				activationBkgColor: soft, activationBorderColor: accent,
			},
		};
	} finally { probe.remove(); }
}

export function mountMermaid(root, loadMermaid = () => import("mermaid").then(m => m.default)) {
	const nodes = [...root.querySelectorAll(".mermaid-diagram[data-mermaid-code]")];
	if (!nodes.length) return () => {};
	const doc = root.ownerDocument, win = doc.defaultView;
	const visible = new Set(), rendered = new WeakMap();
	let disposed = false, running = false, requested = false, timer;
	const controller = new win.AbortController();

	async function draw() {
		requested = true;
		if (running || disposed) return;
		running = true;
		try {
			while (requested && !disposed) {
				requested = false;
				const config = diagramTheme(root), key = JSON.stringify(config);
				for (const node of visible) {
					if (disposed) break;
					if (!node.isConnected) continue;
					if (rendered.get(node) === key) continue;
					const status = node.querySelector(".mermaid-status");
					const retry = node.querySelector(".mermaid-retry");
					status.textContent = "正在绘制图表…";
					status.hidden = true;
					node.setAttribute("aria-busy", "true");
					retry.hidden = true;
					try {
						const mermaid = await loadMermaid();
						const render = async () => {
							if (disposed || !node.isConnected) return;
							const stage = doc.createElement("div");
							stage.className = "mermaid-render-stage";
							stage.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none";
							doc.body.append(stage);
							try {
								mermaid.initialize(config);
								return await mermaid.render(`tonks-mermaid-${++nextId}`, node.dataset.mermaidCode, stage);
							} finally { stage.remove(); }
						};
						const work = renderQueue.then(render);
						renderQueue = work.catch(() => {});
						const result = await work;
						if (disposed || !node.isConnected || !result) return;
						const target = node.querySelector(".mermaid-canvas");
						target.innerHTML = result.svg;
						const svg = target.querySelector("svg");
						const width = svg.viewBox.baseVal.width;
						if (width > 0) svg.style.width = `${Math.ceil(width)}px`;
						svg.style.maxWidth = "100%";
						svg.style.height = "auto";
						if (!svg.hasAttribute("aria-label") && !svg.hasAttribute("aria-labelledby")) svg.setAttribute("aria-label", "Mermaid 图表");
						status.textContent = "";
						node.dataset.mermaidState = "ready";
						rendered.set(node, key);
					} catch (error) {
						if (disposed) return;
						node.dataset.mermaidState = "error";
						status.textContent = "图表未能渲染，请查看源码或重试";
						status.hidden = false;
						node.querySelector(".mermaid-source").open = true;
						retry.hidden = false;
						// Do not retry invalid diagrams on every scroll.
						rendered.set(node, key);
						console.warn("[Mermaid] Diagram rendering failed", error);
					} finally { node.removeAttribute("aria-busy"); }
				}
			}
		} finally { running = false; }
	}
	const schedule = () => { win.clearTimeout(timer); timer = win.setTimeout(draw, 80); };
	for (const node of nodes) node.querySelector(".mermaid-retry").addEventListener("click", () => {
		rendered.delete(node); visible.add(node); schedule();
	}, { signal: controller.signal });
	const observer = new win.MutationObserver(schedule);
	observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-accent-light", "data-accent-dark", "data-yellow"] });
	const intersection = win.IntersectionObserver ? new win.IntersectionObserver(entries => {
		for (const entry of entries) {
			if (entry.isIntersecting) visible.add(entry.target);
			else visible.delete(entry.target);
		}
		if (visible.size) schedule();
	}, { rootMargin: "400px" }) : null;
	for (const node of nodes) {
		if (intersection) intersection.observe(node);
		else visible.add(node);
	}
	if (!intersection) schedule();
	return () => { disposed = true; controller.abort(); observer.disconnect(); intersection?.disconnect(); win.clearTimeout(timer); };
}
