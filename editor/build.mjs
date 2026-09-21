import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=path.dirname(fileURLToPath(import.meta.url));
const blog=process.env.TONKS_BLOG_ROOT||path.resolve(root,'..');
let css=await fs.readFile(path.join(root,'node_modules/katex/dist/katex.min.css'),'utf8');
for(const match of [...css.matchAll(/url\((fonts\/[^)]+)\)/g)]){const data=await fs.readFile(path.join(root,'node_modules/katex/dist',match[1]));const ext=path.extname(match[1]).slice(1);css=css.replace(match[0],`url(data:font/${ext};base64,${data.toString('base64')})`);}
await fs.writeFile(path.join(root,'katex-inline.css'),css);
const common={bundle:true,platform:'node',format:'cjs',target:'es2022',loader:{'.css':'text'},alias:{'@blog':blog},logLevel:'info'};
await fs.mkdir(path.join(root,'dist'),{recursive:true});
await build({...common,entryPoints:[path.join(root,'adapter.mjs')],outfile:path.join(root,'dist/adapter.cjs')});
console.log('博客预览适配资源已更新，无需重新安装 Obsidian 插件');
