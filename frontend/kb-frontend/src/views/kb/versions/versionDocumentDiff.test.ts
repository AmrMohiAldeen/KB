import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import { createVersionDocumentDiff } from './versionDocumentDiff'

const textNodes = (content: JSONContent): JSONContent[] => {
  const result: JSONContent[] = []
  const visit = (node: JSONContent) => {
    if (typeof node.text === 'string') result.push(node)
    node.content?.forEach(visit)
  }
  visit(content)
  return result
}

describe('createVersionDocumentDiff', () => {
  it('marks only changed words while retaining the original formatting marks', () => {
    const older: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'The server must restart every ' },
        { type: 'text', text: '10', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' minutes.' }
      ] }]
    }
    const newer: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'The server must restart every ' },
        { type: 'text', text: '30', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' minutes.' }
      ] }]
    }

    const result = createVersionDocumentDiff(older, newer)
    const oldChanged = textNodes(result.older).find(node => node.text === '10')
    const newChanged = textNodes(result.newer).find(node => node.text === '30')

    expect(oldChanged?.marks).toEqual([
      { type: 'bold' },
      { type: 'versionDiff', attrs: { side: 'removed' } }
    ])
    expect(newChanged?.marks).toEqual([
      { type: 'bold' },
      { type: 'versionDiff', attrs: { side: 'added' } }
    ])
    expect(textNodes(result.older).find(node => node.text?.includes('server'))?.marks).toBeUndefined()
  })

  it('keeps full document structure and marks inserted and removed blocks', () => {
    const older: JSONContent = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Operations' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Remove this paragraph.' }] }
    ] }
    const newer: JSONContent = { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Operations' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Add this paragraph.' }] }
    ] }

    const result = createVersionDocumentDiff(older, newer)

    expect(result.older.content?.map(node => node.type)).toEqual(['heading', 'paragraph'])
    expect(result.newer.content?.map(node => node.type)).toEqual(['heading', 'paragraph'])
    expect(textNodes(result.older).some(node => node.marks?.some(mark => mark.attrs?.side === 'removed'))).toBe(true)
    expect(textNodes(result.newer).some(node => node.marks?.some(mark => mark.attrs?.side === 'added'))).toBe(true)
  })
})
