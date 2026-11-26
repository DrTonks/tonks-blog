import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import localIcons from '../src/plugins/rehype-local-icons.mjs';
import articleMedia from '../src/plugins/rehype-article-media.mjs';

const require = createRequire(import.meta.url);
const astro = createRequire(require.resolve('astro'));
const { createMarkdownProcessor } = await import(pathToFileURL(astro.resolve('@astrojs/markdown-remark')).href);
const markdown = await createMarkdownProcessor({ syntaxHighlight: false, rehypePlugins: [localIcons, articleMedia] });
const render = async text => (await markdown.render(text)).code;

test('inline author icons use local SVG, including aliases and implicit dimensions', async () => {
  const html = await render('before <iconify-icon icon="material-symbols:emoji-events"></iconify-icon> after');
  assert.match(html, /before <iconify-icon[^>]*display:inline-block[^>]*><svg[^>]*width="1em"[^>]*><path/);
  assert.match(html, /<\/svg><\/iconify-icon> after/);
  assert.match(await render('<iconify-icon icon="mdi:camera" height="30"></iconify-icon>'), /height="30"/);
  await assert.rejects(render('<iconify-icon icon="missing:oops"></iconify-icon>'), /missing:oops/);
});

test('icons leave other raw HTML and code examples alone', async () => {
  const block = '<audio src="/audio/x.mp3" title="song"></audio>';
  assert.ok((await render(block + '\n\n<iconify-icon icon="mdi:camera"></iconify-icon>')).includes(await render(block)));
  const code = await render('```html\n<iconify-icon icon="missing:example"></iconify-icon>\n```');
  assert.match(code, /missing:example/);
  assert.doesNotMatch(code, /data-local-icon/);
});
