import { h } from "hastscript";
import { visit } from "unist-util-visit";

// Only standalone images become figures; inline images keep their semantics.
export default function articleMedia() {
	return (tree) => {
		visit(tree, "element", (node) => {
			// Footnote definitions supply previews, not an article chapter.
			if (node.tagName === "h2" && node.properties.id === "footnote-label") node.tagName = "div";
			if (
				node.tagName === "p" &&
				node.children.length === 1 &&
				node.children[0].tagName === "img"
			) {
				const img = node.children[0];
				const caption = String(img.properties.title || "").trim();
				node.tagName = "figure";
				node.properties = { className: ["article-figure"] };
				img.properties.loading = "lazy";
				img.properties.decoding = "async";
				if (caption) {
					img.properties["data-caption"] = caption;
					node.children.push(h("figcaption", caption));
				}
			}
			if (node.tagName === "spoiler" || node.tagName === "spoiler-inline") {
				const inline = node.tagName === "spoiler-inline";
				const warning = String(node.properties.warning || "").trim();
				node.tagName = inline ? "span" : "div";
				node.properties = {
					className: ["article-spoiler"],
					"data-warning": warning,
				};
				node.children = [
					h(
						"button",
						{
							type: "button",
							className: ["spoiler-trigger"],
							"aria-expanded": "false",
						},
						warning ? "剧透提醒 · 点击查看" : "隐藏内容 · 悬停或点击查看",
					),
					h(
						inline ? "span" : "div",
						{
							className: ["spoiler-content"],
							"aria-hidden": "true",
							inert: true,
						},
						node.children,
					),
				];
			}
			if (node.tagName === "audio" && !node.properties.controls) {
				const src = String(node.properties.src || "");
				if (!/^(\/[^/]|https?:\/\/)/i.test(src))
					throw new Error(
						"Audio src must be a public root path or HTTP(S) URL",
					);
				const title = String(node.properties.title || "音频");
				node.tagName = "figure";
				node.properties = { className: ["article-audio"] };
				node.children = [
					h("figcaption", [
						h("span", { className: ["audio-label"] }, "AUDIO / 声音"),
						h("strong", title),
					]),
					h(
						"audio",
						{ src, controls: true, preload: "none", "aria-label": title },
						[h("a", { href: src }, "下载音频")],
					),
				];
			}
			if (node.tagName === "post") node.tagName = "post-reference";
		});
	};
}
