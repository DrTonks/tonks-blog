import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'node-html-parser';

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
export function articleCommentId(slug) {
  const aliases = JSON.parse(readFileSync(resolve('src/data/article-comment-aliases.json'), 'utf8'));
  return aliases[slug] || `a_${hash(slug)}`;
}

// Only prose paragraphs: exclude controls, code, footnotes, spoilers and rich media.
export function annotateCommentBlocks(root, slug) {
  const nodes = root.querySelectorAll('p').filter(node => {
    if (!node.textContent.trim() || node.querySelector('img, audio, video, button, input')) return false;
    for (let p = node.parentNode; p && p !== root; p = p.parentNode) {
      if (['PRE', 'FIGURE', 'TABLE', 'DETAILS', 'SCRIPT'].includes(p.tagName)) return false;
      if (/footnote|spoiler|mermaid|expressive-code/.test(p.getAttribute?.('class') || '')) return false;
    }
    return true;
  });
  const texts = nodes.map(n => {
    const copy = parse(n.innerHTML);
    copy.querySelectorAll('[data-footnote-ref], [data-footnote-backref]').forEach(ref => ref.remove());
    return copy.textContent.replace(/\s+/g, ' ').trim();
  });
  const frequencies = new Map();
  texts.forEach(t => frequencies.set(t, (frequencies.get(t) || 0) + 1));
  const keys = texts.map((text, i) => frequencies.get(text) === 1 ? text : JSON.stringify([texts[i - 1] || '', text, texts[i + 1] || '']));
  const keyCounts = new Map();
  keys.forEach(key => keyCounts.set(key, (keyCounts.get(key) || 0) + 1));
  const blocks = [];
  nodes.forEach((node, i) => {
    const text = texts[i];
    // Duplicate paragraphs include neighbours. Identical ambiguous contexts stay unannotated.
    const key = keys[i];
    const id = `b_${hash(key)}`;
    if (keyCounts.get(key) !== 1) return;
    node.setAttribute('data-comment-block', id);
    if (!node.getAttribute('id')) node.setAttribute('id', `paragraph-${id}`);
    blocks.push({ id, text });
  });
  return { id: articleCommentId(slug), slug, version: hash(JSON.stringify(blocks)), blocks };
}

export function saveDevCommentManifest(article) {
  const directory = resolve('.cache/article-comments');
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, `${article.id}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(article));
  renameSync(tmp, file);
}
