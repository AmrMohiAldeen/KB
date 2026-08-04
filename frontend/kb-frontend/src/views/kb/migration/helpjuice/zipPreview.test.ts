import { describe, expect, it } from 'vitest'
import { parseHelpJuiceCsvPreview } from './csv'
import { openZipEntryStream, type ZipPreviewEntry } from './zipPreview'

describe('HelpJuice ZIP CSV preview', () => {
  it('previews an entry whose declared size previously triggered the browser-preview error', async () => {
    const csv = ['id,name', ...Array.from({ length: 105 }, (_, index) => `${index + 1},Article ${index + 1}`)].join('\n')
    const csvBytes = new TextEncoder().encode(csv)
    const localHeader = new Uint8Array(30)
    const view = new DataView(localHeader.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(8, 0, true)
    view.setUint32(18, csvBytes.length, true)
    view.setUint32(22, csvBytes.length, true)
    const file = new File([localHeader, csvBytes], 'backup.zip')
    const entry: ZipPreviewEntry = {
      name: 'questions.csv',
      compression: 0,
      compressedSize: csvBytes.length,
      size: 20 * 1024 * 1024 + 1,
      localOffset: 0
    }

    const parsed = await parseHelpJuiceCsvPreview(await openZipEntryStream(file, entry), 'questions')

    expect(parsed.rows).toHaveLength(100)
    expect(parsed.rows.at(-1)?.values.id).toBe('100')
  })
})
