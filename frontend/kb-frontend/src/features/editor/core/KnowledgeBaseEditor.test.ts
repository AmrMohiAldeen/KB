import type { JSONContent } from '@tiptap/core'
import { Editor } from '@tiptap/core'
import { act, createElement, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorFileUploadAdapter } from '../extensions/FileHandlerIntegration'
import KnowledgeBaseEditor from './KnowledgeBaseEditor'

const loadedContent: JSONContent = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'Loaded article' }]
  }]
}

const uploadAdapter: EditorFileUploadAdapter = vi.fn()

function RerenderingHarness({ editable = true }: { editable?: boolean }) {
  const [, setChangeCount] = useState(0)

  return createElement(KnowledgeBaseEditor, {
    content: loadedContent,
    editable,
    changeDebounceMs: 0,
    onChange: () => setChangeCount(count => count + 1),
    fileUploadAdapter: uploadAdapter,
    // Deliberately volatile: this was the ArticleEditorShell call pattern that
    // caused the complete Tiptap extension array to change after every edit.
    fileUploadErrorHandler: () => undefined
  })
}

describe('KnowledgeBaseEditor lifecycle', () => {
  let container: HTMLDivElement
  let root: Root
  let mountedEditors: Editor[]
  let mountSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    mountedEditors = []

    const originalMount = Editor.prototype.mount
    mountSpy = vi.spyOn(Editor.prototype, 'mount').mockImplementation(function (
      this: Editor,
      element: Parameters<Editor['mount']>[0]
    ) {
      mountedEditors.push(this)
      return originalMount.call(this, element)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    mountSpy.mockRestore()
  })

  const render = async (editable = true, strict = false) => {
    await act(async () => {
      const editor = createElement(RerenderingHarness, { editable })
      root.render(strict ? createElement(StrictMode, null, editor) : editor)
      await Promise.resolve()
    })
  }

  it('mounts loaded article content and enables editing for an editable lock owner', async () => {
    await render()

    expect(mountedEditors).toHaveLength(1)
    expect(mountedEditors[0].isEditable).toBe(true)
    expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('true')
    expect(container.querySelector('.ProseMirror')?.textContent).toBe('Loaded article')
  })

  it('keeps a non-owner editor read-only', async () => {
    await render(false)

    expect(mountedEditors).toHaveLength(1)
    expect(mountedEditors[0].isEditable).toBe(false)
    expect(container.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false')
  })

  it('preserves typed content and the editor instance across autosave rerenders', async () => {
    await render()
    const editor = mountedEditors[0]
    const editorElement = container.querySelector('.ProseMirror')

    act(() => {
      editor.view.dispatch(
        editor.state.tr.insertText(' typed text', editor.state.doc.content.size - 1)
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mountedEditors).toHaveLength(1)
    expect(mountedEditors[0]).toBe(editor)
    expect(container.querySelector('.ProseMirror')).toBe(editorElement)
    expect(editor.getText()).toBe('Loaded article typed text')
    expect(container.querySelector('.ProseMirror')?.textContent).toBe('Loaded article typed text')
  })

  it('keeps the mounted editor view connected in Strict Mode', async () => {
    await render(true, true)
    const editor = mountedEditors.at(-1)!

    expect(editor.view.dom.isConnected).toBe(true)
    expect(container.querySelector('.ProseMirror')).toBe(editor.view.dom)

    act(() => {
      editor.view.dispatch(
        editor.state.tr.insertText(' strict text', editor.state.doc.content.size - 1)
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(editor.isDestroyed).toBe(false)
    expect(editor.view.dom.isConnected).toBe(true)
    expect(container.querySelector('.ProseMirror')).toBe(editor.view.dom)
    expect(container.querySelector('.ProseMirror')?.textContent).toBe('Loaded article strict text')
  })
})
