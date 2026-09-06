import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerPortalPage from '@/views/kb/viewer/ViewerPortalPage'

export default async function ViewerPortalRoute({ params, searchParams }: {
  params: Promise<{ lang: string; solutionSlug: string }>
  searchParams?: Promise<{ articleUnavailable?: string; __viewerDefaultLocale?: string }>
}) {
  const [{ lang, solutionSlug }, query, accessToken] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ articleUnavailable?: string; __viewerDefaultLocale?: string }>({}),
    getInternalPreviewAccessToken()
  ])
  const articleUnavailable = query.articleUnavailable === '1'
  const activeLocale = query.__viewerDefaultLocale === '1' ? undefined : lang
  return accessToken
    ? <ViewerPortalPage activeLocale={activeLocale} articleUnavailable={articleUnavailable}
        preview={{ categorySlug: solutionSlug, accessToken }} />
    : <ViewerPortalPage activeLocale={activeLocale} articleUnavailable={articleUnavailable} solutionSlug={solutionSlug} />
}
