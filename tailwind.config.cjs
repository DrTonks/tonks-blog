/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
module.exports = {
	content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,mjs}"],
	darkMode: "class", // allows toggling dark mode manually
	theme: {
		extend: {
			fontFamily: {
				sans: ["Roboto", "sans-serif", ...defaultTheme.fontFamily.sans],
				hanalei: ['"Hanalei"', "Noto Sans SC", "system-ui"],
			},
		},
	},
	// Safelist some arbitrary-value utility patterns that are used across the codebase
	// so Tailwind's production purge doesn't drop them. These are stricter patterns
	// that match the actual class shapes in templates (e.g. h-[3.75rem], min-h-[1.2em]).
	safelist: [
		"font-hanalei",
		{ pattern: /^h-\[[^\]]+\]$/ },
		{ pattern: /^w-\[[^\]]+\]$/ },
		{ pattern: /^min-h-\[[^\]]+\]$/ },
		{ pattern: /^max-h-\[[^\]]+\]$/ },
		{ pattern: /^min-w-\[[^\]]+\]$/ },
		{ pattern: /^max-w-\[[^\]]+\]$/ },
		{ pattern: /^-?translate(?:-x|-y)?-\[[^\]]+\]$/ },
		{ pattern: /^-?(top|bottom|left|right)-\[[^\]]+\]$/ },
		{ pattern: /^(gap|m|p|px|py|mx|my)-\[[^\]]+\]$/ },
	],
	plugins: [require("@tailwindcss/typography")],
};
