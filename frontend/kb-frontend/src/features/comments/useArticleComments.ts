'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { articleCommentsApi, type ArticleCommentsApi } from '@/lib/api/articleCommentsApi'
import type { CreateCommentRequest } from '@/types/apps/commentTypes'

export const commentQueryKey = (articleId: string) => ['article-comments', articleId] as const

export function useArticleComments(
  articleId: string,
  accessToken: string,
  api: ArticleCommentsApi = articleCommentsApi
) {
  const client = useQueryClient()
  const queryKey = commentQueryKey(articleId)
  const refresh = () => client.invalidateQueries({ queryKey })
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.list(articleId, accessToken, signal),
    enabled: Boolean(articleId && accessToken)
  })
  const create = useMutation({
    mutationFn: (request: CreateCommentRequest) => api.create(articleId, request, accessToken),
    onSuccess: refresh,
    onError: refresh
  })
  const reply = useMutation({
    mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
      api.reply(articleId, threadId, body, accessToken),
    onSuccess: refresh,
    onError: refresh
  })
  const update = useMutation({
    mutationFn: ({ commentId, body, rowVersion }: {
      commentId: string
      body: string
      rowVersion: string
    }) => api.update(articleId, commentId, { body, rowVersion }, accessToken),
    onSuccess: refresh,
    onError: refresh
  })
  const remove = useMutation({
    mutationFn: ({ commentId, rowVersion }: { commentId: string; rowVersion: string }) =>
      api.delete(articleId, commentId, rowVersion, accessToken),
    onSuccess: refresh,
    onError: refresh
  })
  const resolution = useMutation({
    mutationFn: ({ threadId, rowVersion, resolved }: {
      threadId: string
      rowVersion: string
      resolved: boolean
    }) => api.setResolved(articleId, threadId, rowVersion, resolved, accessToken),
    onSuccess: refresh,
    onError: refresh
  })

  return {
    query,
    create,
    reply,
    update,
    remove,
    resolution,
    isMutating: create.isPending || reply.isPending || update.isPending ||
      remove.isPending || resolution.isPending
  }
}
