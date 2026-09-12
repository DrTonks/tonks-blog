import type { APIRoute, GetStaticPaths } from "astro";
import { projectsData } from "../../data/projects";
import { timelineData } from "../../data/timeline";
import { friendsData } from "../../data/friends";
import { constructionData } from "../../data/construction";

// Compatibility exports for external consumers. Edit src/data/*.ts only.
export const prerender = true;
export const getStaticPaths: GetStaticPaths = () =>
  Object.entries({ projects: projectsData, timeline: timelineData, friends: friendsData, construction: constructionData })
    .map(([name, data]) => ({ params: { name }, props: { data } }));

export const GET: APIRoute = ({ props }) => new Response(JSON.stringify(props.data), {
  headers: { "Content-Type": "application/json; charset=utf-8" },
});
