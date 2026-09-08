// Mirrored to blogExample/src/utils/community-emojis.ts by sync-community-emojis.mjs.
export interface EmojiItem { token: string; label: string; src?: string; text?: string }
export interface EmojiGroup { id: string; label: string; items: EmojiItem[] }
const basics = ['😀','😄','😊','🥰','🤔','😭','😳','👍','👏','🎉','❤️','✨','🌙','🍀','🐾','☕','📚','💻','🚀','👀']
const laopu = [['angry','生气'],['angry2','气鼓鼓'],['cry','哭哭'],['happy-1','开心'],['happy-2','好耶'],['sleep','睡觉'],['think','思考'],['wait','等待']]
let groups: EmojiGroup[] = [
  { id: 'unicode', label: 'Emoji', items: basics.map((text,i) => ({token: `:unicode:${i}:`,label:text,text})) },
  { id: 'laopu', label: '老普专用', items: laopu.map(([id,label]) => ({token:`:laopu:${id}:`,label:label!,src:`/emojis/v1/laopu/${id}.jpg`})) },
]
let index = new Map(groups.flatMap(g => g.items).map(e => [e.token,e]))
const listeners = new Set<() => void>()
let loading: Promise<void> | undefined
let loaded = false
const RECENT_KEY = 'tonks_community_recent_emojis_v1'
const EXCLUDED_GROUPS = new Set(['weibo', 'alu', 'kaomoji'])

export function validateEmojiManifest(value: unknown): EmojiGroup[] {
  if (!value || typeof value !== 'object' || !('groups' in value) || !Array.isArray(value.groups)) throw new Error('Invalid emoji manifest')
  const seen = new Set<string>()
  return value.groups.filter(group => !EXCLUDED_GROUPS.has(group?.id)).slice(0,20).map((group): EmojiGroup => {
    if (!group || typeof group.id !== 'string' || !/^[a-z0-9-]+$/.test(group.id) || typeof group.label !== 'string' || !Array.isArray(group.items)) throw new Error('Invalid emoji group')
    return {id: group.id, label: group.label.slice(0,40), items: group.items.slice(0,800).map((item: EmojiItem) => {
      if (!item || typeof item.token !== 'string' || !/^:[a-z0-9-]+:[a-z0-9-]+:$/.test(item.token) || seen.has(item.token) || typeof item.label !== 'string') throw new Error('Invalid emoji item')
      seen.add(item.token)
      if (typeof item.src === 'string' && /^\/emojis\/v[0-9]+\/[a-z0-9-]+\/[a-zA-Z0-9_-]+\.(png|gif|jpg|jpeg|webp)$/.test(item.src)) return {token:item.token,label:item.label.slice(0,80),src:item.src}
      if (!item.src && typeof item.text === 'string' && item.text.length <= 100) return {token:item.token,label:item.label.slice(0,80),text:item.text}
      throw new Error('Unsafe emoji asset')
    })}
  })
}
export function getEmojiGroups() { return groups.filter(group => !EXCLUDED_GROUPS.has(group.id)) }
export function subscribeEmojis(listener: () => void) { listeners.add(listener); return () => {listeners.delete(listener)} }
export function loadEmojiManifest(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (!loading) loading = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch('/emojis/manifest.json', {signal:controller.signal})
      if (!response.ok) throw new Error('Emoji manifest unavailable')
      const next = validateEmojiManifest(await response.json())
      if (!next.length) throw new Error('Empty emoji manifest')
      groups = next; index = new Map(groups.flatMap(g => g.items).map(e => [e.token,e])); loaded = true
      listeners.forEach(listener => listener())
    } catch { /* Basic and local emoji remain available during a network failure. */ }
    finally { clearTimeout(timer); loading = undefined }
  })()
  return loading
}
export function splitEmojiText(content: string): Array<{text:string;emoji?:EmojiItem}> {
  const result: Array<{text:string;emoji?:EmojiItem}> = []; let offset = 0
  for (const match of content.matchAll(/:[a-z0-9-]+:[a-z0-9-]+:/g)) {
    const emoji = index.get(match[0]); if (!emoji) continue
    if (match.index! > offset) result.push({text:content.slice(offset,match.index)})
    result.push({text:match[0],emoji}); offset = match.index! + match[0].length
  }
  if (offset < content.length) result.push({text:content.slice(offset)})
  return result
}
export function renderEmojiText(element: HTMLElement, content: string) {
  const nodes = splitEmojiText(content).map(part => {
    if (!part.emoji?.src) return document.createTextNode(part.emoji?.text ?? part.text)
    const img = document.createElement('img')
    img.src=part.emoji.src; img.alt=`[${part.emoji.label}]`; img.title=part.emoji.label
    img.className='community-inline-emoji'; img.width=48; img.height=48
    img.loading='lazy'; img.decoding='async'; img.draggable=false
    img.addEventListener('error',()=>img.replaceWith(document.createTextNode(img.alt)),{once:true})
    return img
  })
  element.replaceChildren(...nodes)
}
export function recentEmojis(): EmojiItem[] {
  try { const ids=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(ids)?ids.map(id=>index.get(id)).filter((e):e is EmojiItem=>!!e).slice(0,24):[] } catch {return []}
}
export function rememberEmoji(item: EmojiItem) {
  try {localStorage.setItem(RECENT_KEY,JSON.stringify([item.token,...recentEmojis().map(e=>e.token).filter(id=>id!==item.token)].slice(0,24)))} catch { /* Storage may be disabled. */ }
}
