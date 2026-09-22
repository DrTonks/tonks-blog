import type { APIRoute } from "astro";
import { friendsData } from "../../data/friends";

// A public allowlist. Sleepy reads this from the deployed blog; visitors cannot add fetch URLs.
export const GET: APIRoute = () => new Response(JSON.stringify({
	schema: 1,
	feeds: friendsData.filter(friend => friend.rss).map(({ name, url, rss }) => ({ name, url, rss })),
}), { headers: { "Content-Type": "application/json; charset=utf-8" } });
