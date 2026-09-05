import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectDeploymentFiles, publishInOrder, cacheControlFor, contentTypeFor } from "./deploy-plan.mjs";

test("publishes every resource before HTML, and root version last", async () => {
	const keys = ["version.json", "index.html", "posts/a/index.html", "_astro/a.js", "nested/version.json", "feed.xml"];
	const uploaded = [];
	await publishInOrder(keys.map(key => ({key})), async ({key}) => uploaded.push(key));
	assert.deepEqual(uploaded, ["_astro/a.js", "nested/version.json", "feed.xml", "index.html", "posts/a/index.html", "version.json"]);
});

test("an upload failure prevents publishing later phases/version", async () => {
	for (const failedKey of ["asset.js", "index.html"]) {
		const uploaded = [];
		await assert.rejects(publishInOrder(["version.json", "index.html", "asset.js"].map(key => ({key})), async ({key}) => {
			if (key === failedKey) throw new Error("simulated failure");
			uploaded.push(key);
		}), /simulated failure/);
		assert.equal(uploaded.includes("version.json"), false);
		if (failedKey === "asset.js") assert.equal(uploaded.includes("index.html"), false);
	}
});

test("collects POSIX keys, respects excludes, requires root version", () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tonks-deploy-plan-"));
	try {
		fs.mkdirSync(path.join(directory, "nested"));
		fs.writeFileSync(path.join(directory, "nested", "index.html"), "");
		assert.throws(() => collectDeploymentFiles(directory), /version.json/);
		fs.writeFileSync(path.join(directory, "version.json"), "{}");
		fs.writeFileSync(path.join(directory, ".DS_Store"), "");
		assert.deepEqual(collectDeploymentFiles(directory, [".DS_Store"]).map(file => file.key), ["nested/index.html", "version.json"]);
		assert.throws(() => collectDeploymentFiles(directory, ["version.json"]), /version.json/);
	} finally {
		// Exact directory returned by mkdtemp, never a caller-computed target.
		fs.rmSync(directory, {recursive: true, force: true});
	}
});

test("cache rules prioritize HTML over asset-directory caching", () => {
	for (const key of ["version.json", "index.html", "posts/a/index.html", "_astro/test.html"]) assert.match(cacheControlFor(key), /no-store/);
	assert.match(cacheControlFor("_astro/hash.js"), /immutable/);
	assert.doesNotMatch(cacheControlFor("assets/image.png"), /immutable/);
	assert.equal(contentTypeFor("_astro/HASH.JS"), "text/javascript; charset=utf-8");
	assert.equal(contentTypeFor("image.avif"), "image/avif");
	assert.equal(contentTypeFor("unknown.bin"), "application/octet-stream");
});
