import { Extension } from '@tiptap/core'

const SAFE_HEADING_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/

export function normalizeHeadingId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : ''

  return SAFE_HEADING_ID.test(id) ? id : null
}

export const HeadingIds = Extension.create({
  name: 'headingIds',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          id: {
            default: null,
            parseHTML: element => normalizeHeadingId(element.getAttribute('id')),
            renderHTML: attributes => ({ id: normalizeHeadingId(attributes.id) })
          }
        }
      }
    ]
  }
})
