'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ArticleDetailsResponse, ArticleStatus } from '@/types/apps/articleTypes'
import type {
  ArticleLifecycleAction,
  ArticleLifecycleResponse,
  ArticlePermissionsResponse,
  ArticleReviewEventResponse,
  ArticleVersionSummaryResponse
} from '@/types/apps/articleLifecycleTypes'
import { getArticleById } from '@/lib/api/articlesApi'
import {
  archiveArticle,
  describeLifecycleError,
  getArticlePermissions,
  getArticleReviewHistory,
  getArticleVersions,
  isLifecycleConflict,
  overrideArticleWorkflow,
  restoreArticleVersion,
  transitionArticle
} from '@/lib/api/articleLifecycleApi'

export type ArticleLifecycleApi = {
  getArticle: typeof getArticleById
  getPermissions: typeof getArticlePermissions
  getReviewHistory: typeof getArticleReviewHistory
  getVersions: typeof getArticleVersions
  transition: typeof transitionArticle
  override: typeof overrideArticleWorkflow
  restore: typeof restoreArticleVersion
  archive: typeof archiveArticle
}

const defaultApi: ArticleLifecycleApi = {
  getArticle: getArticleById,
  getPermissions: getArticlePermissions,
  getReviewHistory: getArticleReviewHistory,
  getVersions: getArticleVersions,
  transition: transitionArticle,
  override: overrideArticleWorkflow,
  restore: restoreArticleVersion,
  archive: archiveArticle
}

type UseArticleLifecycleOptions = {
  articleId: string
  accessToken: string
  api?: ArticleLifecycleApi
  beforeAction?: () => Promise<boolean>
  onArchived?: () => void
  onChanged?: () => void
}

export function useArticleLifecycle({
  articleId,
  accessToken,
  api = defaultApi,
  beforeAction,
  onArchived,
  onChanged
}: UseArticleLifecycleOptions) {
  const [article, setArticle] = useState<ArticleDetailsResponse | null>(null)
  const [permissions, setPermissions] = useState<ArticlePermissionsResponse | null>(null)
  const [reviewHistory, setReviewHistory] = useState<ArticleReviewEventResponse[]>([])
  const [versions, setVersions] = useState<ArticleVersionSummaryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<ArticleLifecycleAction | 'restore' | null>(null)
  const [messages, setMessages] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [conflict, setConflict] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(() => {
    setLoading(true)
    setConflict(false)
    setMessages([])
    setRefreshKey(value => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    if (!articleId || !accessToken) {
      void Promise.resolve().then(() => {
        if (controller.signal.aborted) return
        setLoading(false)
        setArticle(null)
        setPermissions(null)
        setMessages([!articleId ? 'No article was selected.' : 'Authentication is required.'])
      })
      return () => controller.abort()
    }

    Promise.all([
      api.getArticle(articleId, accessToken, controller.signal),
      api.getPermissions(articleId, accessToken, controller.signal),
      api.getReviewHistory(articleId, accessToken, controller.signal)
    ]).then(async ([nextArticle, nextPermissions, nextReviewHistory]) => {
      if (controller.signal.aborted) return

      setArticle(nextArticle)
      setPermissions(nextPermissions)
      setReviewHistory(nextReviewHistory)
      setMessages([])

      if (nextPermissions.canViewVersionHistory) {
        const nextVersions = await api.getVersions(
          articleId,
          { page: 1, pageSize: 10 },
          accessToken,
          controller.signal
        )
        if (!controller.signal.aborted) setVersions(nextVersions.items)
      } else {
        setVersions([])
      }
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessages(describeLifecycleError(error))
      setArticle(null)
      setPermissions(null)
      setReviewHistory([])
      setVersions([])
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => controller.abort()
  }, [accessToken, api, articleId, refreshKey])

  const freshRowVersion = useCallback(async (): Promise<string | null> => {
    if (beforeAction && !await beforeAction()) return null
    const freshArticle = await api.getArticle(articleId, accessToken)
    setArticle(freshArticle)
    return freshArticle.currentDraft?.rowVersion ?? null
  }, [accessToken, api, articleId, beforeAction])

  const run = useCallback(async (
    action: ArticleLifecycleAction,
    options: { comment?: string; targetStatus?: ArticleStatus } = {}
  ): Promise<ArticleLifecycleResponse | null> => {
    if (pendingAction) return null
    if (action === 'requestChanges' && !options.comment?.trim()) {
      setMessages(['A reason is required when requesting changes.'])
      return null
    }
    if (action === 'override' && (!options.comment?.trim() || !options.targetStatus)) {
      setMessages(['An override target and reason are required.'])
      return null
    }

    setPendingAction(action)
    setMessages([])
    setSuccessMessage('')
    setConflict(false)

    try {
      const rowVersion = await freshRowVersion()
      if (!rowVersion) {
        if (beforeAction) return null
        throw new Error('The article does not have a current draft row version.')
      }

      if (action === 'archive') {
        await api.archive(articleId, rowVersion, accessToken)
        setSuccessMessage('The article was archived.')
        onArchived?.()
        onChanged?.()
        return null
      }

      const result = action === 'override'
        ? await api.override(articleId, {
            targetStatus: options.targetStatus!,
            reason: options.comment!.trim(),
            rowVersion
          }, accessToken)
        : await api.transition(articleId, action, {
            rowVersion,
            comment: options.comment?.trim() || null
          }, accessToken)

      setSuccessMessage('The article lifecycle was updated.')
      onChanged?.()
      reload()
      return result
    } catch (error) {
      setConflict(isLifecycleConflict(error))
      setMessages(describeLifecycleError(error))
      return null
    } finally {
      setPendingAction(null)
    }
  }, [accessToken, api, articleId, beforeAction, freshRowVersion, onArchived, onChanged, pendingAction, reload])

  const restore = useCallback(async (versionId: string): Promise<ArticleLifecycleResponse | null> => {
    if (pendingAction) return null
    setPendingAction('restore')
    setMessages([])
    setSuccessMessage('')
    setConflict(false)

    try {
      const rowVersion = await freshRowVersion()
      if (!rowVersion) {
        if (beforeAction) return null
        throw new Error('The article does not have a current draft row version.')
      }
      const result = await api.restore(articleId, versionId, { rowVersion }, accessToken)
      setSuccessMessage('The selected version was restored into a new draft.')
      onChanged?.()
      reload()
      return result
    } catch (error) {
      setConflict(isLifecycleConflict(error))
      setMessages(describeLifecycleError(error))
      return null
    } finally {
      setPendingAction(null)
    }
  }, [accessToken, api, articleId, beforeAction, freshRowVersion, onChanged, pendingAction, reload])

  return useMemo(() => ({
    article,
    permissions,
    reviewHistory,
    versions,
    loading,
    pendingAction,
    messages,
    successMessage,
    conflict,
    reload,
    run,
    restore
  }), [
    article,
    conflict,
    loading,
    messages,
    pendingAction,
    permissions,
    reload,
    restore,
    reviewHistory,
    run,
    successMessage,
    versions
  ])
}
