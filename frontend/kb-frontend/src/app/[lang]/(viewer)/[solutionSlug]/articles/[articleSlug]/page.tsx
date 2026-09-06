import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerArticlePage from '@/views/kb/viewer/ViewerArticlePage'

export default async function ViewerArticleRoute({ params, searchParams }: {
  params: Promise<{ lang: string; solutionSlug: string; articleSlug: string }>
  searchParams?: Promise<{ __viewerDefaultLocale?: string }>
}) {
  const [{ lang, solutionSlug, articleSlug }, query, accessToken] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ __viewerDefaultLocale?: string }>({}),
    getInternalPreviewAccessToken()
  ])
  const activeLocale = query.__viewerDefaultLocale === '1' ? undefined : lang
  return accessToken
    ? <ViewerArticlePage activeLocale={activeLocale} articleSlug={articleSlug} preview={{ categorySlug: solutionSlug, accessToken }} />
    : <ViewerArticlePage activeLocale={activeLocale} solutionSlug={solutionSlug} articleSlug={articleSlug} />
}
