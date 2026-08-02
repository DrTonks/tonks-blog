import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const projectRoot = new URL("..", import.meta.url);
const subsetScript = new URL("./subset-hanalei.py", import.meta.url);
const forwardedArgs = process.argv.slice(2);

const candidates = [];
const addCandidate = (command, prefix = [], label = command) => {
	if (!command) return;
	const key = JSON.stringify([command, prefix]);
	if (candidates.some((candidate) => candidate.key === key)) return;
	candidates.push({ command, prefix, label, key });
};

// Allow CI or local development to pin an interpreter without editing scripts.
addCandidate(process.env.FONT_PYTHON, [], "FONT_PYTHON");

// An activated Conda environment is the most reliable source on Windows.
if (process.env.CONDA_PREFIX) {
	const condaPython = join(process.env.CONDA_PREFIX, process.platform === "win32" ? "python.exe" : "bin/python");
	if (existsSync(condaPython)) addCandidate(condaPython, [], "active Conda environment");
}

addCandidate("python", [], "python on PATH");
if (process.platform === "win32") addCandidate("py", ["-3"], "Python launcher");

// This also works when Conda is installed but its base environment is not active.
addCandidate("conda", ["run", "--no-capture-output", "-n", "base", "python"], "Conda base environment");

const probe = "import fontTools, brotli";
let selected;
const failures = [];

for (const candidate of candidates) {
	const result = spawnSync(candidate.command, [...candidate.prefix, "-c", probe], {
		cwd: projectRoot,
		encoding: "utf8",
		stdio: "pipe",
		windowsHide: true,
	});
	if (result.status === 0) {
		selected = candidate;
		break;
	}
	const detail = (result.stderr || result.error?.message || `exit ${result.status}`).trim().split(/\r?\n/).at(-1);
	failures.push(`  - ${candidate.label}: ${detail}`);
}

if (!selected) {
	console.error("[font:subset] No Python interpreter has both fontTools and Brotli.");
	console.error(failures.join("\n"));
	console.error("Install the pinned dependencies, or set FONT_PYTHON to a suitable interpreter:");
	console.error("  python -m pip install -r requirements-font.txt");
	process.exit(1);
}

const result = spawnSync(
	selected.command,
	[...selected.prefix, subsetScript.pathname.replace(/^\/(.:\/)/, "$1"), ...forwardedArgs],
	{
		cwd: projectRoot,
		stdio: "inherit",
		windowsHide: true,
	},
);

if (result.error) {
	console.error(`[font:subset] Failed to start ${selected.label}: ${result.error.message}`);
	process.exit(1);
}

process.exit(result.status ?? 1);
