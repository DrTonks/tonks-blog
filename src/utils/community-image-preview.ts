import { communityOverlayHost } from './community-overlay'

let closeCurrentPreview: (() => void) | undefined

export function attachEmojiPreview(source: HTMLImageElement) {
  source.tabIndex = 0
  source.setAttribute('role', 'button')
  source.setAttribute('aria-label', `预览表情：${source.alt}`)
  source.setAttribute('aria-haspopup', 'dialog')
  const open = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    closeCurrentPreview?.()
    const dialog = document.createElement('dialog')
    dialog.className = 'community-image-preview'
    dialog.setAttribute('aria-label', `表情预览：${source.alt}`)
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'community-image-preview__close'
    close.textContent = '关闭预览 ×'
    close.autofocus = true
    const image = document.createElement('img')
    image.src = source.currentSrc || source.src
    image.alt = source.alt
    image.draggable = false
    const caption = document.createElement('p')
    caption.textContent = source.title || source.alt
    dialog.append(close, image, caption)
    const observer = new MutationObserver(() => {
      if (!source.isConnected || !dialog.isConnected) dismiss()
    })
    const dismiss = () => {
      observer.disconnect()
      dialog.close()
      dialog.remove()
      if (closeCurrentPreview === dismiss) closeCurrentPreview = undefined
      if (source.isConnected) source.focus({ preventScroll: true })
    }
    closeCurrentPreview = dismiss
    close.addEventListener('click', dismiss)
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss() })
    // Keep interactions inside the existing community modal's event boundary.
    dialog.addEventListener('pointerdown', event => event.stopPropagation())
    dialog.addEventListener('keydown', event => event.stopPropagation())
    dialog.addEventListener('click', event => {
      event.stopPropagation()
      if (event.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss()
    })
    communityOverlayHost(source).append(dialog)
    dialog.showModal()
    observer.observe(document.body, { childList: true, subtree: true })
  }
  source.addEventListener('click', open)
  source.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') open(event)
  })
}
