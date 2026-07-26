'use client'

import type { JSONContent } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ArticleDraftResponse,
  DraftLockMutationResponse,
  SaveArticleDraftRequest,
  SaveArticleDraftResponse
} from '@/types/apps/articleDraftTypes'
import {
  acquireArticleDraftLock,
  describeArticleDraftApiError,
  getArticleDraft,
  isArticleDraftConflict,
  releaseArticleDraftLock,
  saveArticleDraftContent
} from '../../../lib/api/articleDraftsApi'
import { ApiError, hasAccessToken } from '../../../lib/api/http'
import {
  ArticleDraftAutosaveCoordinator,
  type DraftAutosaveSnapshot
} from './ArticleDraftAutosaveCoordinator'

export type DraftEditorPhase = 'loading' | 'acquiring' | 'editing' | 'readonly' | 'locked' | 'error'

export type ArticleDraftEditorApi = {
  get: (articleId: string, accessToken: string) => Promise<ArticleDraftResponse>
  acquire: (articleId: string, rowVersion: string, accessToken: string) => Promise<DraftLockMutationResponse>
  release: (
    articleId: string,
    rowVersion: string,
    accessToken: string,
    keepalive?: boolean
  ) => Promise<DraftLockMutationResponse>
  save: (
    articleId: string,
    request: SaveArticleDraftRequest,
    accessToken: string
  ) => Promise<SaveArticleDraftResponse>
}

const defaultApi: ArticleDraftEditorApi = {
  get: getArticleDraft,
  acquire: (articleId, rowVersion, accessToken) =>
    acquireArticleDraftLock(articleId, { rowVersion }, accessToken),
  release: (articleId, rowVersion, accessToken, keepalive) =>
    releaseArticleDraftLock(articleId, { rowVersion }, accessToken, { keepalive }),
  save: saveArticleDraftContent
}

const initialSaveState: DraftAutosaveSnapshot = {
  status: 'saved',
  dirty: false,
  rowVersion: '',
  error: null
}

const inFlightOperations = new Map<string, Promise<unknown>>()

const singleFlight = <T,>(key: string, operation: () => Promise<T>): Promise<T> => {
  const current = inFlightOperations.get(key) as Promise<T> | undefined

  if (current) return current

  const next = operation()
  inFlightOperations.set(key, next)
  const cleanUp = () => {
    window.setTimeout(() => {
      if (inFlightOperations.get(key) === next) inFlightOperations.delete(key)
    }, 0)
  }
  void next.then(cleanUp, cleanUp)
  return next
}

const mergeLock = (draft: ArticleDraftResponse, lock: DraftLockMutationResponse): ArticleDraftResponse => ({
  ...draft,
  rowVersion: lock.rowVersion,
  lock: lock.lock,
  canEdit: lock.canEdit,
  isLockOwner: lock.isLockOwner,
  updatedAt: lock.updatedAt
})

export type UseArticleDraftEditorOptions = {
  articleId: string
  accessToken: string
  debounceMs?: number
  api?: ArticleDraftEditorApi
}

export function useArticleDraftEditor({
  articleId,
  accessToken,
  debounceMs = 1200,
  api = defaultApi
}: UseArticleDraftEditorOptions) {
  const [phase, setPhase] = useState<DraftEditorPhase>('loading')
  const [draft, setDraft] = useState<ArticleDraftResponse | null>(null)
  const [messages, setMessages] = useState<string[]>([])
  const [saveState, setSaveState] = useState<DraftAutosaveSnapshot>(initialSaveState)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [editorKey, setEditorKey] = useState(0)
  const coordinatorRef = useRef<ArticleDraftAutosaveCoordinator | null>(null)
  const generationRef = useRef(0)
  const releaseStartedRef = useRef(false)
  const authenticated = hasAccessToken(accessToken)

  const createCoordinator = useCallback((loaded: ArticleDraftResponse) => {
    const generation = ++generationRef.current
    coordinatorRef.current?.destroy()
    const coordinator = new ArticleDraftAutosaveCoordinator({
      rowVersion: loaded.rowVersion,
      debounceMs,
      save: request => api.save(articleId, request, accessToken),
      onStateChange: next => {
        if (generationRef.current === generation) setSaveState(next)
      }
    })

    coordinatorRef.current = coordinator
    setSaveState(coordinator.snapshot)
    return coordinator
  }, [accessToken, api, articleId, debounceMs])

  useEffect(() => {
    let cancelled = false
    const generation = ++generationRef.current
    coordinatorRef.current?.destroy()
    coordinatorRef.current = null
    releaseStartedRef.current = false

    const load = async () => {
      if (!articleId) {
        setDraft(null)
        setPhase('error')
        setMessages(['No article was selected. Return to Articles and open an editor from the article list.'])
        return
      }

      if (!authenticated) {
        setDraft(null)
        setPhase('error')
        setMessages(['Sign in through the company authentication provider before loading an article draft.'])
        return
      }

      setPhase('loading')
      setMessages([])
      setSaveState(initialSaveState)

      try {
        const loaded = await singleFlight(
          `draft:get:${articleId}:${loadAttempt}`,
          () => api.get(articleId, accessToken)
        )
        if (cancelled || generationRef.current !== generation) return

        setDraft(loaded)
        setEditorKey(current => current + 1)
        setSaveState({ ...initialSaveState, rowVersion: loaded.rowVersion })

        if (!loaded.canEdit) {
          setPhase('readonly')
          setMessages(['Read-only: you do not have permission to edit this draft.'])
          return
        }

        if (loaded.lock.isLocked && !loaded.isLockOwner) {
          setPhase('locked')
          setMessages(['This draft is locked by another user and has opened read-only.'])
          return
        }

        if (loaded.isLockOwner) {
          createCoordinator(loaded)
          setPhase('editing')
          return
        }

        setPhase('acquiring')
        const acquired = await singleFlight(
          `draft:acquire:${articleId}:${loaded.rowVersion}`,
          () => api.acquire(articleId, loaded.rowVersion, accessToken)
        )
        if (cancelled || generationRef.current !== generation) return

        const editableDraft = mergeLock(loaded, acquired)
        setDraft(editableDraft)

        if (!acquired.canEdit || !acquired.isLockOwner) {
          setPhase(acquired.lock.isLocked ? 'locked' : 'readonly')
          setMessages(['The draft lock was not acquired, so the editor remains read-only.'])
          return
        }

        createCoordinator(editableDraft)
        setPhase('editing')
      } catch (error) {
        if (cancelled || generationRef.current !== generation) return

        if (isArticleDraftConflict(error)) {
          try {
            const refreshed = await singleFlight(
              `draft:refresh-after-conflict:${articleId}:${loadAttempt}`,
              () => api.get(articleId, accessToken)
            )
            if (cancelled || generationRef.current !== generation) return

            setDraft(refreshed)
            setEditorKey(current => current + 1)
            setSaveState({ ...initialSaveState, rowVersion: refreshed.rowVersion })

            if (refreshed.isLockOwner && refreshed.canEdit) {
              createCoordinator(refreshed)
              setPhase('editing')
              return
            }

            setPhase(refreshed.lock.isLocked ? 'locked' : 'readonly')
            setMessages(['The draft changed while its lock was being acquired. It has opened read-only.'])
            return
          } catch (refreshError) {
            error = refreshError
          }
        }

        if (error instanceof ApiError && error.status === 403) {
          setPhase('readonly')
        } else {
          setPhase('error')
        }
        setMessages(describeArticleDraftApiError(error))
      }
    }

    void Promise.resolve().then(load)
    return () => {
      cancelled = true
    }
  }, [accessToken, api, articleId, authenticated, createCoordinator, loadAttempt])

  useEffect(() => () => {
    generationRef.current += 1
    coordinatorRef.current?.destroy()
  }, [])

  const onEditorChange = useCallback((content: JSONContent, renderedHtml?: string, plainText?: string) => {
    coordinatorRef.current?.update(content, renderedHtml, plainText)
  }, [])

  const retrySave = useCallback(() => coordinatorRef.current?.retry() ?? Promise.resolve(false), [])

  const reload = useCallback(() => {
    const dirty = coordinatorRef.current?.snapshot.dirty ?? false
    if (dirty && !window.confirm('Reloading will discard your unsaved local changes. Reload the server draft?')) return
    setLoadAttempt(current => current + 1)
  }, [])

  const leave = useCallback(async (navigate: () => void): Promise<boolean> => {
    const coordinator = coordinatorRef.current
    let saved = true

    if (coordinator?.snapshot.dirty) saved = await coordinator.flush()

    if (!saved && coordinator?.snapshot.dirty &&
      !window.confirm('Unsaved changes remain. Leave this editor and discard those local changes?')) {
      return false
    }

    const currentDraft = draft
    const ownsLock = currentDraft?.isLockOwner || phase === 'editing'

    if (ownsLock && currentDraft && authenticated && !releaseStartedRef.current) {
      releaseStartedRef.current = true
      try {
        const rowVersion = coordinator?.snapshot.rowVersion || currentDraft.rowVersion
        const released = await api.release(articleId, rowVersion, accessToken)
        setDraft(value => value ? mergeLock(value, released) : value)
      } catch (error) {
        releaseStartedRef.current = false
        setMessages(describeArticleDraftApiError(error))
        if (!window.confirm('The draft lock could not be released. Leave the editor anyway?')) return false
      }
    }

    navigate()
    return true
  }, [accessToken, api, articleId, authenticated, draft, phase])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!coordinatorRef.current?.snapshot.dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    const pageHide = () => {
      const coordinator = coordinatorRef.current
      if (!authenticated || !draft?.isLockOwner || coordinator?.snapshot.dirty || coordinator?.snapshot.status === 'saving' ||
        releaseStartedRef.current) return

      releaseStartedRef.current = true
      void api.release(articleId, coordinator?.snapshot.rowVersion || draft.rowVersion, accessToken, true)
        .catch(() => { releaseStartedRef.current = false })
    }

    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', pageHide)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', pageHide)
    }
  }, [accessToken, api, articleId, authenticated, draft])

  return {
    phase,
    draft,
    messages,
    saveState,
    editorKey,
    editable: phase === 'editing' && Boolean(draft?.isLockOwner),
    onEditorChange,
    retrySave,
    reload,
    leave
  }
}
