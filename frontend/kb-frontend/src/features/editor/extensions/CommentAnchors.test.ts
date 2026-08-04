import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommentAnchors, type EditorCommentAnchor } from './CommentAnchors'

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy())
})

const createEditor = (
  anchors: EditorCommentAnchor[],
  activeId: string | null,
  onSelect = vi.fn()
) => {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    content: '<p>target text</p><p>other</p>',
    extensions: [
      StarterKit,
      CommentAnchors.configure({
        getAnchors: () => anchors,
        getActiveThreadId: () => activeId,
        onSelect
      })
    ]
  })
  editors.push(editor)
  return { editor, onSelect }
}

describe('CommentAnchors', () => {
  it('decorates attached inline and block anchors and opens their threads on click', () => {
    const anchors: EditorCommentAnchor[] = [
      {
        commentId: 'inline-1',
        anchorType: 'TextRange',
        anchorData: { from: 1, to: 7, selectedText: 'target' },
        anchorStatus: 'Attached',
        status: 'Open'
      },
      {
        commentId: 'block-1',
        anchorType: 'Block',
        anchorData: { position: 13, nodeType: 'paragraph', text: 'other' },
        anchorStatus: 'Attached',
        status: 'Open'
      }
    ]
    const { editor, onSelect } = createEditor(anchors, 'inline-1')

    const inline = editor.view.dom.querySelector<HTMLElement>('[data-comment-thread-id="inline-1"]')
    const block = editor.view.dom.querySelector<HTMLElement>('[data-comment-thread-id="block-1"]')
    expect(inline?.textContent).toBe('target')
    expect(inline?.classList.contains('kb-comment-anchor--active')).toBe(true)
    expect(block?.textContent).toBe('other')

    inline?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('inline-1')
  })

  it('does not attach stale, orphaned, resolved, or invalid-position anchors', () => {
    const anchors: EditorCommentAnchor[] = [
      {
        commentId: 'stale',
        anchorType: 'TextRange',
        anchorData: { from: 1, to: 7, selectedText: 'target' },
        anchorStatus: 'NeedsReanchoring',
        status: 'Open'
      },
      {
        commentId: 'orphan',
        anchorType: 'Block',
        anchorData: { position: 0, nodeType: 'paragraph', text: 'target text' },
        anchorStatus: 'Orphaned',
        status: 'Open'
      },
      {
        commentId: 'resolved',
        anchorType: 'TextRange',
        anchorData: { from: 1, to: 7, selectedText: 'target' },
        anchorStatus: 'Attached',
        status: 'Resolved'
      },
      {
        commentId: 'invalid',
        anchorType: 'TextRange',
        anchorData: { from: 999, to: 1005, selectedText: 'target' },
        anchorStatus: 'Attached',
        status: 'Open'
      }
    ]
    const { editor } = createEditor(anchors, null)

    expect(editor.view.dom.querySelector('[data-comment-thread-id]')).toBeNull()
  })
})
