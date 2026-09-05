import test from "node:test";
import assert from "node:assert/strict";
import { h } from "hastscript";
import media from "../src/plugins/rehype-article-media.mjs";
const transform = (node) => {
	const tree = { type: "root", children: [node] };
	media()(tree);
	return tree.children[0];
};
test("standalone images get optional escaped text captions, inline images stay inline", () => {
	const figure = transform(
		h("p", [h("img", { src: "/x.png", title: "<b>caption</b>" })]),
	);
	assert.equal(figure.tagName, "figure");
	assert.equal(figure.children[1].children[0].type, "text");
	assert.equal(figure.children[1].children[0].value, "<b>caption</b>");
	assert.equal(
		transform(h("p", [h("img", { src: "/x.png", title: "  " })])).children
			.length,
		1,
	);
	assert.equal(
		transform(h("p", ["text ", h("img", { src: "/x.png" })])).tagName,
		"p",
	);
});
test("spoiler block with a list stays block and starts inert", () => {
	const node = transform(
		h("spoiler", { warning: "warning" }, [h("ul", [h("li", "secret")])]),
	);
	assert.equal(node.tagName, "div");
	assert.equal(node.children[1].properties.inert, true);
	assert.equal(node.properties["data-warning"], "warning");
});
test("inline spoiler uses phrasing elements", () => {
	const node = transform(h("spoiler-inline", "secret"));
	assert.equal(node.tagName, "span");
	assert.equal(node.children[1].tagName, "span");
});
test("audio is wrapped only once and never autoplays", () => {
	const node = transform(h("audio", { src: "/audio/test.mp3", title: "test" }));
	assert.equal(node.tagName, "figure");
	assert.equal(node.children[1].tagName, "audio");
	assert.equal(node.children[1].properties.preload, "none");
	assert.equal(node.children[1].properties.autoplay, undefined);
});
test("audio rejects executable or ambiguous source URLs", () => {
	for (const src of [
		"javascript:alert(1)",
		"data:text/html,hi",
		"//evil.test/audio",
		"relative.mp3",
	])
		assert.throws(() => transform(h("audio", { src })));
});
