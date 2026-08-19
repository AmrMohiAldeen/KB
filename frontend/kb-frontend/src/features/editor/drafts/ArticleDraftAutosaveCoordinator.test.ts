import type { JSONContent } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/api/http'
import type { SaveArticleDraftResponse } from '@/types/apps/articleDraftTypes'
import { ArticleDraftAutosaveCoordinator, type DraftAutosaveSnapshot } from './ArticleDraftAutosaveCoordinator'

const doc = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
})

const response = (rowVersion: string): SaveArticleDraftResponse => ({
  draftId: 'draft-id', contentHash: null, contentSizeBytes: 10, rowVersion, updatedAt: '2026-07-15T10:00:00Z'
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('ArticleDraftAutosaveCoordinator', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('does not save initial content and debounces edits', async () => {
    const save = vi.fn().mockResolvedValue(response('v2'))
    const coordinator = new ArticleDraftAutosaveCoordinator({ rowVersion: 'v1', debounceMs: 1200, save })

    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()

    coordinator.update(doc('first'), '<p>first</p>', 'first')
    await vi.advanceTimersByTimeAsync(1199)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toMatchObject({ rowVersion: 'v1', renderedHtml: '<p>first</p>', plainText: 'first' })
  })

  it('saves imported color and table-width attributes without rewriting them', async () => {
    const save = vi.fn().mockResolvedValue(response('v2'))
    const coordinator = new ArticleDraftAutosaveCoordinator({ rowVersion: 'v1', debounceMs: 1, save })
    const imported: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Color', marks: [{ type: 'textStyle', attrs: { color: '#ff0066' } }] }] },
        { type: 'table', attrs: { tableWidthPct: 75 }, content: [
          { type: 'tableRow', content: [
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [250] }, content: [{ type: 'paragraph' }] },
            { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [750] }, content: [{ type: 'paragraph' }] }
          ] }
        ] }
      ]
    }

    coordinator.update(imported, '<p><span style="color:#ff0066">Color</span></p><table style="width:75%"></table>', 'Color')
    await vi.advanceTimersByTimeAsync(1)

    expect(save.mock.calls[0][0].content).toEqual(imported)
    expect(save.mock.calls[0][0].renderedHtml).toContain('color:#ff0066')
    expect(save.mock.calls[0][0].renderedHtml).toContain('width:75%')
  })

  it('never overlaps saves and queues one latest follow-up with the replaced row version', async () => {
    const first = deferred<SaveArticleDraftResponse>()
    const second = deferred<SaveArticleDraftResponse>()
    const save = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const states: DraftAutosaveSnapshot[] = []
    const coordinator = new ArticleDraftAutosaveCoordinator({
      rowVersion: 'v1', debounceMs: 1200, save, onStateChange: state => states.push(state)
    })

    coordinator.update(doc('one'))
    await vi.advanceTimersByTimeAsync(1200)
    expect(save).toHaveBeenCalledTimes(1)

    coordinator.update(doc('two'))
    coordinator.update(doc('latest'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(coordinator.snapshot).toMatchObject({ status: 'dirty', dirty: true, rowVersion: 'v1' })

    first.resolve(response('v2'))
    await Promise.resolve()
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0].rowVersion).toBe('v2')
    expect(save.mock.calls[1][0].content).toEqual(doc('latest'))
    expect(states.some(state => state.status === 'dirty')).toBe(true)

    second.resolve(response('v3'))
    await coordinator.flush()
    expect(coordinator.snapshot).toMatchObject({ status: 'saved', dirty: false, rowVersion: 'v3' })
  })

  it('flushes a pending edit once when Save now is pressed repeatedly', async () => {
    const pending = deferred<SaveArticleDraftResponse>()
    const save = vi.fn().mockReturnValue(pending.promise)
    const coordinator = new ArticleDraftAutosaveCoordinator({ rowVersion: 'v1', debounceMs: 1200, save })

    coordinator.update(doc('manual'))
    const firstFlush = coordinator.flush()
    const secondFlush = coordinator.flush()

    expect(save).toHaveBeenCalledTimes(1)
    pending.resolve(response('v2'))

    await expect(firstFlush).resolves.toBe(true)
    await expect(secondFlush).resolves.toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(coordinator.snapshot).toMatchObject({ status: 'saved', dirty: false, rowVersion: 'v2' })
  })

  it('preserves dirty content after a failed save and retries explicitly', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new ApiError(503))
      .mockResolvedValueOnce(response('v2'))
    const coordinator = new ArticleDraftAutosaveCoordinator({ rowVersion: 'v1', debounceMs: 1200, save })

    coordinator.update(doc('unsaved'))
    await vi.advanceTimersByTimeAsync(1200)
    expect(coordinator.snapshot).toMatchObject({ status: 'failed', dirty: true, rowVersion: 'v1' })

    await coordinator.retry()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0].content).toEqual(doc('unsaved'))
    expect(coordinator.snapshot).toMatchObject({ status: 'saved', dirty: false, rowVersion: 'v2' })
  })

  it('stops autosave on conflict without discarding later edits', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(409))
    const coordinator = new ArticleDraftAutosaveCoordinator({ rowVersion: 'v1', debounceMs: 1200, save })

    coordinator.update(doc('conflicting'))
    await vi.advanceTimersByTimeAsync(1200)
    expect(coordinator.snapshot).toMatchObject({ status: 'conflict', dirty: true, rowVersion: 'v1' })

    coordinator.update(doc('still local'))
    await vi.advanceTimersByTimeAsync(5000)
    await coordinator.retry()
    expect(save).toHaveBeenCalledTimes(1)
    expect(coordinator.snapshot).toMatchObject({ status: 'conflict', dirty: true })
  })
})
