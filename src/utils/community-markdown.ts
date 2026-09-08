// Shared with the blog. Build DOM from a small allowlist of Markdown tokens;
// user HTML is always text, never passed to an HTML parser or innerHTML.
import { marked, type Token, type Tokens } from 'marked'
import { decodeHTMLStrict } from 'entities'
import { renderEmojiText, splitEmojiText } from './community-emojis'

export function safeCommentUrl(value: string): string | undefined {
  if (/[\u0000-\u0020\u007f]/.test(value)) return
  try {
    const url = new URL(value, 'https://blog.tonks.top/')
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) return
    return url.href
  } catch { return }
}

export function renderCommunityMarkdown(element: HTMLElement, content: string, compact = false) {
  element.classList.add('community-markdown')
  element.classList.toggle('community-markdown--compact', compact)
  const text = (value: string, emojis = true): Node => {
    if (!emojis) return document.createTextNode(value)
    const span = document.createElement('span')
    renderEmojiText(span, value)
    return span
  }
  const render = (tokens: Token[], depth = 0): Node[] => {
    if (depth > 30) return [text(tokens.map(t => t.raw).join(''), false)]
    return tokens.flatMap((token): Node[] => {
      const child = (tag: string, nested: Token[] = []) => {
        const node = document.createElement(tag)
        node.append(...render(nested, depth + 1)); return node
      }
      switch (token.type) {
        case 'space': case 'def': return []
        case 'html': case 'escape': return [text(token.text || token.raw, false)]
        case 'text': return token.tokens ? render(token.tokens, depth + 1) : [text(decodeHTMLStrict(token.text))]
        case 'paragraph': return [child('p', token.tokens)]
        case 'heading': return [child(`h${Math.min(6, token.depth + 1)}`, token.tokens)]
        case 'strong': return [child('strong', token.tokens)]
        case 'em': return [child('em', token.tokens)]
        case 'del': return [child('del', token.tokens)]
        case 'blockquote': return [child('blockquote', token.tokens)]
        case 'br': return [document.createElement('br')]
        case 'hr': return [document.createElement('hr')]
        case 'codespan': {
          const code = document.createElement('code'); code.textContent = token.text; return [code]
        }
        case 'code': {
          const pre = document.createElement('pre'), code = document.createElement('code')
          code.textContent = token.text; pre.append(code); return [pre]
        }
        case 'link': case 'image': {
          // Decode exactly once before validation; code, HTML and escaped tokens
          // above deliberately remain literal Markdown source.
          const href = safeCommentUrl(decodeHTMLStrict(token.href))
          const label = token.type === 'image' ? [text(`[图片：${decodeHTMLStrict(token.text) || '查看'}]`, false)] : render(token.tokens ?? [], depth + 1)
          if (!href) return label
          const anchor = document.createElement('a')
          anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer nofollow ugc'
          if (token.title) anchor.title = decodeHTMLStrict(token.title)
          if (token.type === 'image' && /^https?:/.test(href)) {
            const img=document.createElement('img')
            img.src=href; img.alt=decodeHTMLStrict(token.text); img.className='community-markdown-image'
            img.loading='lazy'; img.decoding='async'; img.referrerPolicy='no-referrer'
            img.addEventListener('error',()=>anchor.replaceChildren(...label),{once:true})
            anchor.append(img); return [anchor]
          }
          if (token.type === 'link' && token.text.startsWith('@') && new URL(href).origin === 'https://blog.tonks.top' && new URL(href).pathname.startsWith('/posts/')) {
            anchor.className = 'community-article-mention'
            anchor.textContent = label.map(node => node.textContent).join('').slice(1)
            anchor.setAttribute('aria-label', `查看文章：${anchor.textContent}`)
          } else anchor.append(...label)
          return [anchor]
        }
        case 'list': {
          const list = document.createElement(token.ordered ? 'ol' : 'ul')
          if (token.ordered && typeof token.start === 'number') (list as HTMLOListElement).start = token.start
          for (const item of token.items) {
            const li = child('li', item.tokens)
            if (item.task) {
              const check = document.createElement('input'); check.type = 'checkbox'; check.checked = !!item.checked; check.disabled = true
              check.setAttribute('aria-label', item.checked ? '已完成' : '未完成'); li.prepend(check)
            }
            list.append(li)
          }
          return [list]
        }
        case 'table': {
          const scroll = document.createElement('div'); scroll.className = 'community-markdown-table'
          const table = document.createElement('table'), head = document.createElement('thead'), body = document.createElement('tbody')
          const row = (cells: Tokens.TableCell[], tag: string) => {
            const tr = document.createElement('tr')
            cells.forEach((cell, i) => { const td = child(tag, cell.tokens); if (token.align[i]) td.style.textAlign = token.align[i]!; tr.append(td) })
            return tr
          }
          head.append(row(token.header, 'th')); token.rows.forEach((cells: Tokens.TableCell[]) => body.append(row(cells, 'td')))
          table.append(head, body); scroll.append(table); return [scroll]
        }
        default: return [text(token.raw, false)]
      }
    })
  }
  try { element.replaceChildren(...render(marked.lexer(content, { gfm: true, breaks: true }))) }
  catch { element.replaceChildren(text(content)) }
}

export function commentPlainText(content: string): string {
  const text = (value: string) => splitEmojiText(value)
    .map(part => part.emoji ? (part.emoji.text ?? `[${part.emoji.label}]`) : part.text).join('')
  const extract = (tokens: Token[], separator = '', depth = 0): string => {
    if (depth > 30) return tokens.map(token => token.raw).join(separator)
    return tokens.map((token): string => {
      const nested = (children: Token[] = [], between = '') => extract(children, between, depth + 1)
      switch (token.type) {
        case 'space': case 'def': case 'hr': return ''
        // Escapes and code are already literal. Decoding after joining tokens
        // would turn an escaped \& followed by "amp;" into an unwanted entity.
        case 'escape': case 'html': case 'codespan': case 'code': return token.text
        case 'text': return token.tokens ? nested(token.tokens) : text(decodeHTMLStrict(token.text))
        case 'paragraph': case 'heading': case 'strong': case 'em': case 'del':
          return nested(token.tokens)
        case 'br': return '\n'
        case 'blockquote': case 'list_item': return nested(token.tokens, '\n')
        case 'list': return nested(token.items, '\n')
        case 'table':
          return [token.header, ...token.rows].map((cells: Tokens.TableCell[]) =>
            cells.map(cell => nested(cell.tokens)).join('\t')).join('\n')
        case 'image': {
          const label = nested(token.tokens)
          return label.trim() ? label : '[图片：查看]'
        }
        case 'link': {
          const label = nested(token.tokens)
          const href = safeCommentUrl(decodeHTMLStrict(token.href))
          if (token.text.startsWith('@') && href) {
            const url = new URL(href)
            if (url.origin === 'https://blog.tonks.top' && url.pathname.startsWith('/posts/')) return label.slice(1)
          }
          return label
        }
        default: return token.raw
      }
    }).filter(value => value !== '').join(separator)
  }
  try { return extract(marked.lexer(content, { gfm: true, breaks: true }), '\n') }
  catch { return content }
}
