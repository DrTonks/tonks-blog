import { getCollection } from "astro:content";
import { getPostUrlBySlug } from "../../utils/url-utils";

export const prerender = true;
export async function GET() {
  const posts = await getCollection("posts", ({data}) => !data.draft);
  const articles = await Promise.all(posts.sort((a,b) => +b.data.published - +a.data.published).map(async post => {
    // Do not disclose headings from password-protected articles.
    const headings = post.data.encrypted ? [] : (await post.render()).headings;
    return {title:post.data.title, url:new URL(getPostUrlBySlug(post.slug), "https://blog.tonks.top").href,
      headings:headings.map(heading => ({title:heading.text.replace(/#$/, "").trim(),id:heading.slug}))};
  }));
  return new Response(JSON.stringify(articles), {headers:{"Content-Type":"application/json; charset=utf-8"}});
}
