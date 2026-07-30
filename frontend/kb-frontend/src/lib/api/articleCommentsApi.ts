import type {
  ArticleComment,
  ArticleCommentsResponse,
  CreateCommentRequest,
  UpdateCommentRequest
} from '@/types/apps/commentTypes'
import { apiRequest } from './http'

const path = (articleId: string) => `/api/articles/${encodeURIComponent(articleId)}/comments`

export const getArticleComments = (
  articleId: string,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<ArticleCommentsResponse>(path(articleId), accessToken, { signal })

export const createArticleComment = (
  articleId: string,
  request: CreateCommentRequest,
  accessToken: string
) => apiRequest<ArticleComment>(path(articleId), accessToken, {
  method: 'POST',
  body: JSON.stringify(request)
})

export const replyToArticleComment = (
  articleId: string,
  threadId: string,
  body: string,
  accessToken: string
) => apiRequest<ArticleComment>(
  `${path(articleId)}/${encodeURIComponent(threadId)}/replies`,
  accessToken,
  { method: 'POST', body: JSON.stringify({ body }) }
)

export const updateArticleComment = (
  articleId: string,
  commentId: string,
  request: UpdateCommentRequest,
  accessToken: string
) => apiRequest<ArticleComment>(
  `${path(articleId)}/${encodeURIComponent(commentId)}`,
  accessToken,
  { method: 'PUT', body: JSON.stringify(request) }
)

export const deleteArticleComment = (
  articleId: string,
  commentId: string,
  rowVersion: string,
  accessToken: string
) => apiRequest<void>(
  `${path(articleId)}/${encodeURIComponent(commentId)}`,
  accessToken,
  { method: 'DELETE', body: JSON.stringify({ rowVersion }) }
)

export const setArticleCommentResolved = (
  articleId: string,
  threadId: string,
  rowVersion: string,
  resolved: boolean,
  accessToken: string
) => apiRequest<ArticleComment>(
  `${path(articleId)}/${encodeURIComponent(threadId)}/${resolved ? 'resolve' : 'reopen'}`,
  accessToken,
  { method: 'POST', body: JSON.stringify({ rowVersion }) }
)

export const articleCommentsApi = {
  list: getArticleComments,
  create: createArticleComment,
  reply: replyToArticleComment,
  update: updateArticleComment,
  delete: deleteArticleComment,
  setResolved: setArticleCommentResolved
}

export type ArticleCommentsApi = typeof articleCommentsApi
