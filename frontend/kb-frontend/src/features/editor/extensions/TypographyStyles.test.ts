import { Editor, type JSONContent } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'

import { getEditorExtensions } from './'
import { convertHelpJuiceHtml } from '../../../views/kb/migration/helpjuice/conversion'
import {
  sanitizeCssFontSize,
  sanitizeCssFontStyle,
  sanitizeCssFontWeight,
  sanitizeCssLineHeight
} from '../lib/typographyStyles'

const editors: Editor[] = []

function createEditor(content: JSONContent | string): Editor {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({ element, extensions: getEditorExtensions(), content })
  editors.push(editor)
  return editor
}

function typographyForText(editor: Editor, text: string): Record<string, unknown> | null {
  let attributes: Record<string, unknown> | null = null
  editor.state.doc.descendants(node => {
    if (!node.isText || node.text !== text) return
    attributes = node.marks.find(mark => mark.type.name === 'textStyle')?.attrs ?? null
  })
  return attributes
}

afterEach(() => editors.splice(0).forEach(editor => editor.destroy()))

describe('HelpJuice typography styles', () => {
  it.each([
    ['8px', sanitizeCssFontSize], ['10pt', sanitizeCssFontSize], ['0.8em', sanitizeCssFontSize],
    ['125%', sanitizeCssFontSize], ['small', sanitizeCssFontSize], ['larger', sanitizeCssFontSize],
    ['normal', sanitizeCssFontWeight], ['bold', sanitizeCssFontWeight], ['lighter', sanitizeCssFontWeight],
    ['bolder', sanitizeCssFontWeight], ['100', sanitizeCssFontWeight], ['425.5', sanitizeCssFontWeight],
    ['900', sanitizeCssFontWeight], ['normal', sanitizeCssFontStyle], ['italic', sanitizeCssFontStyle],
    ['oblique', sanitizeCssFontStyle], ['oblique -12deg', sanitizeCssFontStyle],
    ['normal', sanitizeCssLineHeight], ['1', sanitizeCssLineHeight], ['1.5', sanitizeCssLineHeight],
    ['24px', sanitizeCssLineHeight], ['14pt', sanitizeCssLineHeight], ['150%', sanitizeCssLineHeight],
    ['1.4em', sanitizeCssLineHeight]
  ])('accepts valid CSS typography value %s', (value, sanitize) => {
    expect(sanitize(value)).toBe(value)
  })

  it.each([
    ['expression(alert(1))', sanitizeCssFontSize], ['12px; color: red', sanitizeCssFontSize],
    ['-1px', sanitizeCssFontSize], ['1001', sanitizeCssFontWeight], ['url(https://evil.test)', sanitizeCssFontWeight],
    ['oblique 91deg', sanitizeCssFontStyle], ['oblique calc(1deg)', sanitizeCssFontStyle],
    ['-1', sanitizeCssLineHeight], ['1; position: fixed', sanitizeCssLineHeight]
  ])('rejects malformed or unsafe CSS typography value %s', (value, sanitize) => {
    expect(sanitize(value)).toBeNull()
  })

  it('survives sanitize, Tiptap JSON, save/reload HTML, and rendering for non-preset values', () => {
    const migrated = convertHelpJuiceHtml([
      '<p>',
      '<span style="font-size:10pt">SizePt</span>',
      '<span style="font-size:larger">SizeKeyword</span>',
      '<span style="font-weight:350.5">VariableWeight</span>',
      '<strong style="font-weight:normal">NormalWeight</strong>',
      '<span style="font-style:oblique 12deg">AngledStyle</span>',
      '<em style="font-style:normal">NormalStyle</em>',
      '<span style="line-height:1.4em">RelativeHeight</span>',
      '</p>'
    ].join(''))

    const editor = createEditor(migrated.tiptapJson as JSONContent)
    expect(typographyForText(editor, 'SizePt')).toMatchObject({ fontSize: '10pt' })
    expect(typographyForText(editor, 'SizeKeyword')).toMatchObject({ fontSize: 'larger' })
    expect(typographyForText(editor, 'VariableWeight')).toMatchObject({ fontWeight: '350.5' })
    expect(typographyForText(editor, 'NormalWeight')).toMatchObject({ fontWeight: 'normal' })
    expect(typographyForText(editor, 'AngledStyle')).toMatchObject({ fontStyle: 'oblique 12deg' })
    expect(typographyForText(editor, 'NormalStyle')).toMatchObject({ fontStyle: 'normal' })
    expect(typographyForText(editor, 'RelativeHeight')).toMatchObject({ lineHeight: '1.4em' })

    const renderedHtml = editor.getHTML()
    expect(renderedHtml).toContain('font-size: 10pt')
    expect(renderedHtml).toContain('font-size: larger')
    expect(renderedHtml).toContain('font-weight: 350.5')
    expect(renderedHtml).toContain('font-style: oblique 12deg')
    expect(renderedHtml).toContain('line-height: 1.4em')

    // HTML represents the draft/version/published rendering boundary. Parsing
    // it again proves the attributes are not dependent on preset UI values.
    const restored = createEditor(renderedHtml)
    expect(typographyForText(restored, 'SizePt')).toMatchObject({ fontSize: '10pt' })
    expect(typographyForText(restored, 'VariableWeight')).toMatchObject({ fontWeight: '350.5' })
    expect(typographyForText(restored, 'AngledStyle')).toMatchObject({ fontStyle: 'oblique 12deg' })
    expect(typographyForText(restored, 'RelativeHeight')).toMatchObject({ lineHeight: '1.4em' })
  })

  it('validates commands and untrusted JSON attributes before rendering', () => {
    const editor = createEditor({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Unsafe',
          marks: [{
            type: 'textStyle',
            attrs: {
              fontSize: 'expression(alert(1))',
              fontWeight: '1001',
              fontStyle: 'oblique 100deg',
              lineHeight: 'url(javascript:alert(1))'
            }
          }]
        }]
      }]
    })

    expect(editor.getHTML()).toBe('<p><span>Unsafe</span></p>')
    expect(editor.getHTML()).not.toMatch(/expression|javascript|font-(?:size|weight|style)|line-height/i)
    editor.commands.selectAll()
    expect(editor.commands.setFontWeight('425')).toBe(true)
    expect(editor.getAttributes('textStyle').fontWeight).toBe('425')
    expect(editor.commands.setFontWeight('1001')).toBe(false)
    expect(editor.getAttributes('textStyle').fontWeight).toBe('425')
  })
})
