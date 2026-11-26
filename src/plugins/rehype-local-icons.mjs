import { visit } from 'unist-util-visit';
import { buildIcon, replaceIDs } from '@iconify/svelte/dist/functions.js';
import { findLocalIcon } from '../utils/local-icons.server.mjs';

// Resolve authored HTML elements after Astro parses Markdown. Code examples stay text.
export default function localContentIcons({ strict = true } = {}) {
  // Astro registers its built-in raw HTML parser after user plugins. Append
  // this transformer when unified freezes the completed processor so it sees
  // the final elements without moving HTML parsing ahead of other transforms.
  this.use(renderLocalIcons, { strict });
}

function renderLocalIcons({ strict }) {
  return (tree, file) => {
    visit(tree, 'element', node => {
      if (node.tagName !== 'iconify-icon') return;
      const { icon, width, height, rotate, flip, inline, ...attributes } = node.properties;
      const data = typeof icon === 'string' && findLocalIcon(icon);
      if (!data) {
        const message = `Unknown Iconify icon "${icon}" in ${file.path ?? 'Markdown'}`;
        if (strict) throw new Error(message);
        console.warn(message);
        return;
      }
      const flips = String(flip ?? '').split(/[\s,]+/);
      const angle = String(rotate ?? '0');
      const turns = Number.parseFloat(angle) / (angle.endsWith('deg') ? 90 : angle.endsWith('%') ? 25 : 1);
      const svg = buildIcon(data, {
        width: width ?? null, height: height ?? null, rotate: Number.isInteger(turns) ? (turns % 4 + 4) % 4 : 0,
        hFlip: flips.includes('horizontal'), vFlip: flips.includes('vertical'),
      });
      node.properties = { ...attributes, 'data-local-icon': icon };
      node.properties.style = `display:inline-block;${inline != null && inline !== 'false' ? 'vertical-align:-0.125em;' : ''}${attributes.style ?? ''}`;
      node.children = [{
        type: 'element', tagName: 'svg', properties: { ...svg.attributes, style: 'display:block' },
        children: [{ type: 'raw', value: replaceIDs(svg.body) }],
      }];
    });
  };
}
