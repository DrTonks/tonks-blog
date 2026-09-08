import fs from "node:fs";
import path from "node:path";

export function deploymentPhase(key) {
	if (key === "version.json") return 2;
	return /\.html?$/i.test(key) ? 1 : 0;
}

export function collectDeploymentFiles(directory, excludes = []) {
	const files = [];
	function visit(dir) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (excludes.includes(entry.name)) continue;
			const localPath = path.join(dir, entry.name);
			if (entry.isSymbolicLink()) throw new Error(`Build contains a symbolic link: ${localPath}`);
			if (entry.isDirectory()) visit(localPath);
			else if (entry.isFile()) files.push({ localPath, key: path.relative(directory, localPath).split(path.sep).join("/") });
		}
	}
	visit(directory);
	if (!files.some(({ key }) => key === "version.json")) {
		throw new Error("dist/version.json is missing or excluded. Rebuild before deploying.");
	}
	return files.sort((a, b) => deploymentPhase(a.key) - deploymentPhase(b.key) || a.key.localeCompare(b.key));
}

// Stage barriers ensure no HTML is published before its resources, and no
// version signal is published before every HTML upload has succeeded.
export async function publishInOrder(files, upload) {
	for (const phase of [0, 1, 2]) {
		for (const file of files.filter(({ key }) => deploymentPhase(key) === phase)) await upload(file);
	}
}

export function cacheControlFor(key) {
	if (deploymentPhase(key) > 0) return "no-cache, no-store, must-revalidate";
	if (key.startsWith("_astro/")) return "public, max-age=31536000, immutable";
	return "public, max-age=0, must-revalidate";
}

const contentTypes = {
	".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
	".json": "application/json", ".map": "application/json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
	".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
	".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
	".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
	".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".flac": "audio/flac",
	".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf", ".wasm": "application/wasm",
	".webmanifest": "application/manifest+json", ".zip": "application/zip",
};
export function contentTypeFor(key) {
	return contentTypes[path.posix.extname(key).toLowerCase()] || "application/octet-stream";
}
