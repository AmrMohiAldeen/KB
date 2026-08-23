import { Editor, type JSONContent } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'

import { getEditorExtensions } from './'

const editors: Editor[] = []

function createEditor(content: JSONContent | string): Editor {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, extensions: getEditorExtensions(), content })
  editors.push(editor)
  return editor
}

afterEach(() => editors.splice(0).forEach(editor => editor.destroy()))

describe('LegacyHelpJuiceFormatting', () => {
  it('round-trips canonical migration attributes through editor HTML', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { dir: 'auto', textAlign: 'center' },
          content: [
            { type: 'text', text: 'Mixed', marks: [{ type: 'textStyle', attrs: { dir: 'auto', color: '#1f497d', fontFamily: 'Segoe UI', fontSize: '16px' } }] },
            { type: 'text', text: ' download', marks: [{ type: 'link', attrs: { href: 'https://example.test/guide.pdf', download: 'guide.pdf' } }] }
          ]
        },
        { type: 'horizontalRule', attrs: { width: '50%', alignment: 'center' } },
        {
          type: 'table',
          attrs: { minHeight: '200px', alignment: 'center', tableWidthPct: 75 },
          content: [{
            type: 'tableRow',
            attrs: { rowHeight: 40 },
            content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }] }]
          }]
        },
        {
          type: 'video',
          attrs: {
            src: 'https://static.helpjuice.com/demo.mp4',
            poster: 'https://static.helpjuice.com/poster.jpg',
            title: 'Tutorial',
            allowFullscreen: true,
            allowedPermissions: 'autoplay; picture-in-picture',
            borderless: true,
            tabIndex: 0
          }
        }
      ]
    }

    const editor = createEditor(content)
    const html = editor.getHTML()

    expect(html).toContain('dir="auto"')
    expect(html).toContain('download="guide.pdf"')
    expect(html).toContain('data-table-min-height="200px"')
    expect(html).toContain('data-table-alignment="center"')
    expect(html).toContain('data-row-height="40"')
    expect(html).toContain('poster="https://static.helpjuice.com/poster.jpg"')

    const restored = createEditor(html)
    expect(restored.getJSON().content?.[0]?.attrs?.dir).toBe('auto')
    expect(restored.getJSON().content?.[2]?.attrs?.minHeight).toBe('200px')
    expect(restored.getJSON().content?.[3]?.attrs?.poster).toBe('https://static.helpjuice.com/poster.jpg')
  })
})
