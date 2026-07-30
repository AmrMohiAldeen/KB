import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export type MediaContentLoader = (mediaId: string) => Promise<Blob>

type ResolvedElement = {
  mediaId: string
  objectUrl: string
}

function createMediaContentResolverPlugin(
  loadContent: MediaContentLoader
): Plugin {
  return new Plugin({
    view(view: EditorView) {
      const resolved = new Map<HTMLElement, ResolvedElement>()
      const loading = new WeakMap<HTMLElement, string>()
      let destroyed = false

      const releaseDisconnected = () => {
        resolved.forEach((entry, element) => {
          if (element.isConnected) return
          URL.revokeObjectURL(entry.objectUrl)
          resolved.delete(element)
        })
      }

      const applyObjectUrl = (element: HTMLElement, objectUrl: string) => {
        if (element instanceof HTMLAnchorElement) element.href = objectUrl
        else if (element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
          element.src = objectUrl
        }
      }

      const resolve = () => {
        if (destroyed) return
        releaseDisconnected()
        view.dom.querySelectorAll<HTMLElement>('[data-media-id]').forEach(element => {
          const mediaId = element.dataset.mediaId?.trim()
          if (!mediaId || resolved.get(element)?.mediaId === mediaId || loading.get(element) === mediaId) {
            return
          }

          const previous = resolved.get(element)
          if (previous) {
            URL.revokeObjectURL(previous.objectUrl)
            resolved.delete(element)
          }

          loading.set(element, mediaId)
          void loadContent(mediaId).then(blob => {
            if (destroyed || !element.isConnected || element.dataset.mediaId !== mediaId) return
            const objectUrl = URL.createObjectURL(blob)
            resolved.set(element, { mediaId, objectUrl })
            applyObjectUrl(element, objectUrl)
          }).catch(() => {
            element.dataset.mediaLoadError = 'true'
          }).finally(() => {
            if (loading.get(element) === mediaId) loading.delete(element)
          })
        })
      }

      queueMicrotask(resolve)
      return {
        update: resolve,
        destroy() {
          destroyed = true
          resolved.forEach(entry => URL.revokeObjectURL(entry.objectUrl))
          resolved.clear()
        }
      }
    }
  })
}

export const MediaContentResolver = Extension.create<{
  loadContent?: MediaContentLoader
}>({
  name: 'mediaContentResolver',

  addOptions() {
    return { loadContent: undefined }
  },

  addProseMirrorPlugins() {
    return this.options.loadContent
      ? [createMediaContentResolverPlugin(this.options.loadContent)]
      : []
  }
})
