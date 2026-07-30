import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type {
  ArticleComment,
  BlockCommentAnchor,
  TextRangeCommentAnchor
} from '@/types/apps/commentTypes'

export type EditorCommentAnchor = Pick<
  ArticleComment,
  'commentId' | 'anchorType' | 'anchorData' | 'anchorStatus' | 'status'
>

export type CommentAnchorsOptions = {
  getAnchors: () => readonly EditorCommentAnchor[]
  getActiveThreadId: () => string | null
  onSelect: (threadId: string) => void
}

export const commentAnchorsPluginKey = new PluginKey('commentAnchors')

export const CommentAnchors = Extension.create<CommentAnchorsOptions>({
  name: 'commentAnchors',

  addOptions() {
    return {
      getAnchors: () => [],
      getActiveThreadId: () => null,
      onSelect: () => undefined
    }
  },

  addProseMirrorPlugins() {
    const options = this.options
    return [
      new Plugin({
        key: commentAnchorsPluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const activeId = options.getActiveThreadId()
            for (const anchor of options.getAnchors()) {
              if (anchor.status !== 'Open' || anchor.anchorStatus !== 'Attached' || !anchor.anchorData)
                continue
              const className = `kb-comment-anchor${anchor.commentId === activeId ? ' kb-comment-anchor--active' : ''}`
              const attributes = {
                class: className,
                'data-comment-thread-id': anchor.commentId,
                'aria-label': 'Commented content'
              }
              if (anchor.anchorType === 'TextRange') {
                const range = anchor.anchorData as TextRangeCommentAnchor
                if (Number.isInteger(range.from) && Number.isInteger(range.to) &&
                    range.from > 0 && range.to > range.from && range.to <= state.doc.content.size + 1)
                  decorations.push(Decoration.inline(range.from, range.to, attributes))
              } else if (anchor.anchorType === 'Block') {
                const block = anchor.anchorData as BlockCommentAnchor
                const node = state.doc.nodeAt(block.position)
                if (node && block.position >= 0 && block.position + node.nodeSize <= state.doc.content.size)
                  decorations.push(Decoration.node(
                    block.position,
                    block.position + node.nodeSize,
                    attributes
                  ))
              }
            }
            return DecorationSet.create(state.doc, decorations)
          },
          handleDOMEvents: {
            click(_view, event) {
              const target = event.target instanceof Element
                ? event.target.closest<HTMLElement>('[data-comment-thread-id]')
                : null
              const threadId = target?.dataset.commentThreadId
              if (!threadId) return false
              options.onSelect(threadId)
              return true
            }
          }
        }
      })
    ]
  }
})
