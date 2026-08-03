import { describe, expect, it } from 'vitest'
import { parseHelpJuiceCsvPreview } from './csv'

describe('HelpJuice streaming CSV preview', () => {
  it('cancels the source stream after 100 complete data rows', async () => {
    const encoder = new TextEncoder()
    const firstRows = ['id,name', ...Array.from({ length: 100 }, (_, index) => `${index + 1},Row ${index + 1}`)].join('\n') + '\n'
    let pulls = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(encoder.encode(pulls === 1 ? firstRows : '101,This row must not be parsed\n'))
      },
      cancel() {
        cancelled = true
      }
    }, { highWaterMark: 0 })

    const parsed = await parseHelpJuiceCsvPreview(stream, 'questions')

    expect(parsed.rows).toHaveLength(100)
    expect(parsed.rows.at(-1)?.values.id).toBe('100')
    expect(pulls).toBe(1)
    expect(cancelled).toBe(true)
  })
})
