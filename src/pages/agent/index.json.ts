import {publicCatalog} from '../../utils/public-catalog';
export const prerender=true;
export async function GET(){
  const catalog=await publicCatalog();
  return new Response(JSON.stringify({...catalog,articles:catalog.articles.map(({markdown,...article})=>article)}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-cache'}});
}

