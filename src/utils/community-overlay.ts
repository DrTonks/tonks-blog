// Keep community popups inside the owning modal's focus/pointer boundary.
// Teleporting to body escapes that boundary and is treated as an outside click.
export function communityOverlayHost(anchor: HTMLElement | null): HTMLElement {
  return anchor?.closest<HTMLElement>('[data-community-overlay-root]') ?? document.body
}

export function communityOverlayPosition(anchor: HTMLElement, preferredWidth: number, preferredHeight = 480): Record<string, string> {
  const host = communityOverlayHost(anchor)
  const local = host !== document.body
  const hostRect = host.getBoundingClientRect()
  const bounds = local
    ? {left:Math.max(0,hostRect.left),top:Math.max(0,hostRect.top),right:Math.min(innerWidth,hostRect.right),bottom:Math.min(innerHeight,hostRect.bottom)}
    : {left:0,top:0,right:innerWidth,bottom:innerHeight}
  const rect = anchor.getBoundingClientRect()
  const width = Math.max(0, Math.min(preferredWidth, bounds.right - bounds.left - 24))
  const above = Math.max(0, rect.top - bounds.top - 16)
  const below = Math.max(0, bounds.bottom - rect.bottom - 16)
  const openAbove = above >= Math.min(320, below)
  const maxHeight = Math.min(preferredHeight, Math.max(above, below))
  const left = Math.max(bounds.left + 12, Math.min(rect.left, bounds.right - width - 12))
  return {
    position:local?'absolute':'fixed', width:`${width}px`,
    left:`${left - (local ? hostRect.left + host.clientLeft : 0)}px`,
    maxHeight:`${Math.max(0, Math.min(preferredHeight, openAbove ? above : below, maxHeight))}px`,
    top:openAbove?'auto':`${rect.bottom + 8 - (local ? hostRect.top + host.clientTop : 0)}px`,
    bottom:openAbove?`${(local ? hostRect.bottom - host.clientTop : innerHeight) - rect.top + 8}px`:'auto',
  }
}
