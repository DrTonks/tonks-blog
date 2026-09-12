import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

export default function articleComments() {
  return { name: 'article-comments-manifest', hooks: {
    'astro:build:done': ({ dir }) => {
      const root = fileURLToPath(dir), articles = [];
      function walk(folder) {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          const file = join(folder, entry.name);
          if (entry.isDirectory()) walk(file);
          else if (entry.name.endsWith('.html')) {
            const data = parse(readFileSync(file, 'utf8')).querySelector('script[data-article-comment-map]');
            if (data) articles.push(JSON.parse(data.textContent));
          }
        }
      }
      walk(root);
      if(new Set(articles.map(a=>a.id)).size!==articles.length)throw new Error('Duplicate article comment ID: check article-comment-aliases.json');
      mkdirSync(join(root, 'community'), { recursive: true });
      writeFileSync(join(root, 'community/comment-manifest.json'), JSON.stringify({ schema: 1, articles }));
      console.log(`[article-comments] ${articles.length} published articles`);
    }
  }};
}
