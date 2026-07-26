import type { JSONContent } from '@tiptap/core'
import { act, createElement, StrictMode, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArticleDraftResponse, DraftLockMutationResponse } from '@/types/apps/articleDraftTypes'
import {
  type ArticleDraftEditorApi,
  useArticleDraftEditor,
  type UseArticleDraftEditorOptions
} from './useArticleDraftEditor'

type EditorState = ReturnType<typeof useArticleDraftEditor>

const content: JSONContent = { type: 'doc', content: [] }

const draft = (overrides: Partial<ArticleDraftResponse> = {}): ArticleDraftResponse => ({
  draftId: 'draft-id',
  articleId: 'article-id',
  content,
  contentHash: null,
  contentSizeBytes: 0,
  rowVersion: 'v1',
  status: 'Draft',
  lock: { isLocked: false, lockedBy: null, lockedAt: null },
  canEdit: true,
  isLockOwner: false,
  createdBy: { userId: 'author-id', fullName: 'Author' },
  updatedBy: null,
  createdAt: '2026-07-15T09:00:00Z',
  updatedAt: '2026-07-15T09:00:00Z',
  ...overrides
})

const acquired: DraftLockMutationResponse = {
  rowVersion: 'v2',
  lock: {
    isLocked: true,
    lockedBy: { userId: 'current-user', fullName: 'Current User' },
    lockedAt: '2026-07-15T10:00:00Z'
  },
  canEdit: true,
  isLockOwner: true,
  updatedAt: '2026-07-15T10:00:00Z'
}

const createApi = (overrides: Partial<ArticleDraftEditorApi> = {}): ArticleDraftEditorApi => ({
  get: vi.fn().mockResolvedValue(draft()),
  acquire: vi.fn().mockResolvedValue(acquired),
  release: vi.fn().mockResolvedValue({ ...acquired, rowVersion: 'v4', isLockOwner: false, lock: { isLocked: false, lockedBy: null, lockedAt: null } }),
  save: vi.fn().mockResolvedValue({
    draftId: 'draft-id', contentHash: null, contentSizeBytes: 12, rowVersion: 'v3', updatedAt: '2026-07-15T10:01:00Z'
  }),
  ...overrides
})

function Harness({ options, onState }: { options: UseArticleDraftEditorOptions; onState: (state: EditorState) => void }) {
  const state = useArticleDraftEditor(options)
  useEffect(() => onState(state), [onState, state])
  return null
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('useArticleDraftEditor', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  const render = async (
    api: ArticleDraftEditorApi,
    strict = false,
    overrides: Partial<UseArticleDraftEditorOptions> = {}
  ) => {
    let latest!: EditorState
    const element = createElement(Harness, {
      options: { articleId: `article-${Math.random()}`, accessToken: 'token', api, ...overrides },
      onState: state => { latest = state }
    })

    await act(async () => {
      root.render(strict ? createElement(StrictMode, null, element) : element)
      await Promise.resolve()
      await Promise.resolve()
    })

    return { get latest() { return latest } }
  }

  it('keeps the editor disabled until the single lock acquisition succeeds in Strict Mode', async () => {
    const lock = deferred<DraftLockMutationResponse>()
    const api = createApi({ acquire: vi.fn().mockReturnValue(lock.promise) })
    const state = await render(api, true)

    expect(state.latest.phase).toBe('acquiring')
    expect(state.latest.editable).toBe(false)
    expect(api.acquire).toHaveBeenCalledTimes(1)

    await act(async () => {
      lock.resolve(acquired)
      await lock.promise
      await Promise.resolve()
    })

    expect(state.latest.phase).toBe('editing')
    expect(state.latest.editable).toBe(true)
  })

  it('opens a foreign lock read-only and does not attempt acquisition', async () => {
    const api = createApi({
      get: vi.fn().mockResolvedValue(draft({
        lock: {
          isLocked: true,
          lockedBy: { userId: 'other-user', fullName: 'Other User' },
          lockedAt: '2026-07-15T08:00:00Z'
        }
      }))
    })
    const state = await render(api)

    expect(state.latest.phase).toBe('locked')
    expect(state.latest.editable).toBe(false)
    expect(state.latest.draft?.lock.lockedBy?.fullName).toBe('Other User')
    expect(api.acquire).not.toHaveBeenCalled()
    expect(api.save).not.toHaveBeenCalled()
  })

  it('does not send draft requests without an authenticated access token', async () => {
    const api = createApi()
    const state = await render(api, false, { accessToken: '  ' })

    expect(state.latest.phase).toBe('error')
    expect(state.latest.messages).toContain('Sign in through the company authentication provider before loading an article draft.')
    expect(api.get).not.toHaveBeenCalled()
    expect(api.acquire).not.toHaveBeenCalled()
    expect(api.save).not.toHaveBeenCalled()
    expect(api.release).not.toHaveBeenCalled()
  })

  it('flushes Save now immediately without duplicating a pending autosave request', async () => {
    const api = createApi({
      get: vi.fn().mockResolvedValue(draft({
        rowVersion: 'v2',
        isLockOwner: true,
        lock: { isLocked: true, lockedBy: { userId: 'current-user', fullName: 'Current User' }, lockedAt: '2026-07-15T10:00:00Z' }
      }))
    })
    const state = await render(api)
    const edited: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

    act(() => state.latest.onEditorChange(edited, '<p></p>', ''))
    await act(async () => {
      await Promise.all([state.latest.retrySave(), state.latest.retrySave()])
    })

    expect(api.save).toHaveBeenCalledTimes(1)
    expect(api.save).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ content: edited, rowVersion: 'v2' }), 'token')
    expect(state.latest.saveState).toMatchObject({ status: 'saved', dirty: false, rowVersion: 'v3' })
  })

  it('does not autosave loaded content and flushes before release on normal navigation', async () => {
    const api = createApi({
      get: vi.fn().mockResolvedValue(draft({
        rowVersion: 'v2',
        isLockOwner: true,
        lock: { isLocked: true, lockedBy: { userId: 'current-user', fullName: 'Current User' }, lockedAt: '2026-07-15T10:00:00Z' }
      }))
    })
    const state = await render(api)
    expect(state.latest.phase).toBe('editing')
    expect(api.save).not.toHaveBeenCalled()

    const edited: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }
    act(() => state.latest.onEditorChange(edited, '<p></p>', ''))
    const navigate = vi.fn()

    await act(async () => {
      await state.latest.leave(navigate)
    })

    expect(api.save).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      content: edited, rowVersion: 'v2'
    }), 'token')
    expect(api.release).toHaveBeenCalledWith(expect.any(String), 'v3', 'token')
    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
