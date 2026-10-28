import { h } from "hastscript";
import { visit } from "unist-util-visit";

// Shared by Astro and the offline editor. Article source is text, never script.
export function rehypeMermaid() {
	return (tree) => {
		visit(tree, "element", (node) => {
			if (!node.properties?.className?.includes("mermaid-container")) return;
			const code = node.properties["data-mermaid-code"] ?? node.properties.dataMermaidCode ?? "";
			node.tagName = "div";
			node.properties = { className: ["mermaid-diagram"], "data-mermaid-code": code };
			node.children = [
				h("div", { className: ["mermaid-status"], role: "status", hidden: true }),
				h("button", { type: "button", className: ["mermaid-retry"], hidden: true }, "重新渲染"),
				h("div", { className: ["mermaid-viewport"], role: "region", "aria-label": "Mermaid 图表" }, [h("div", { className: ["mermaid-canvas"] })]),
				h("details", { className: ["mermaid-source"] }, [
					h("summary", "查看图表源码"),
					h("pre", [h("code", code)]),
				]),
			];
		});
	};
}
