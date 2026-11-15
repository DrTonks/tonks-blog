import {getCollection} from 'astro:content';
import path from 'node:path';
import {publicArticle,publicMarkdown} from '../../scripts/public-markdown.mjs';
import {projectsData} from '../data/projects';
import {scanAlbums} from './album-scanner';
import {getPostUrlBySlug} from './url-utils';
import {BLOG_ORIGIN} from './search-policy.mjs';

async function generate(){
  const posts=(await getCollection('posts')).filter(p=>publicArticle(p.data));
  const byFile=new Map(posts.map(p=>[p.id,p]));
  const articles=posts.sort((a,b)=>+b.data.published-+a.data.published||a.slug.localeCompare(b.slug)).map(p=>{
    const canonical=new URL(getPostUrlBySlug(p.slug),BLOG_ORIGIN).href;
    const content=publicMarkdown(p.body,{canonical,title:p.data.title,resolveLink:(value:string)=>{
      const [file,hash]=value.split('#');
      let decoded:string;try{decoded=decodeURIComponent(file);}catch{return null;}
      const target=byFile.get(path.posix.normalize(path.posix.join(path.posix.dirname(p.id),decoded)));
      return target?new URL(getPostUrlBySlug(target.slug),BLOG_ORIGIN).href+(hash?'#'+hash:''):null;
    }});
    return {id:p.slug,kind:'article',title:p.data.title,description:p.data.description,category:p.data.category||'',tags:p.data.tags,
      published:p.data.published.toISOString(),modified:(p.data.updated||p.data.published).toISOString(),url:canonical,
      markdownUrl:`${BLOG_ORIGIN}/agent/articles/${p.slug}.md`,text:content.text,markdown:content.markdown};
  });
  const projects=projectsData.map(p=>({id:p.id,kind:'project',title:p.title,description:p.description,tags:p.tags||p.techStack,category:p.category,url:`${BLOG_ORIGIN}/projects/`,source:p.sourceCode||p.sourceUrl||null,status:p.status}));
  const albums=(await scanAlbums()).map(a=>({id:a.id,kind:'album',title:a.title,description:a.description,tags:a.tags,date:a.date,location:a.location,url:`${BLOG_ORIGIN}/albums/${a.id}/`}));
  return {schemaVersion:1,site:BLOG_ORIGIN+'/',articles,projects,albums};
}
let built:ReturnType<typeof generate>|undefined;
// No persistent dev cache: author edits must be visible without restarting dev.
export function publicCatalog(){return import.meta.env.PROD ? built??=generate() : generate();}

