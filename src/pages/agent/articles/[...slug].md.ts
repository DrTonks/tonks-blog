import {publicCatalog} from '../../../utils/public-catalog';
export const prerender=true;
export async function getStaticPaths(){return (await publicCatalog()).articles.map(article=>({params:{slug:article.id},props:{markdown:article.markdown}}));}
export function GET({props}:{props:{markdown:string}}){return new Response(props.markdown,{headers:{'Content-Type':'text/markdown; charset=utf-8','Cache-Control':'no-cache'}});}

