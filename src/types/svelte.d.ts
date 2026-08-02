declare module "*.svelte" {
	import type { SvelteComponentTyped } from "svelte";
	const Component: typeof SvelteComponentTyped;
	export default Component;
}
