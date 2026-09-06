import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerPortalPage from '@/views/kb/viewer/ViewerPortalPage'

export default async function ViewerCategoryRoute({ params, searchParams }: {
  params: Promise<{ lang: string; solutionSlug: string; categorySlug: string }>
  searchParams?: Promise<{ __viewerDefaultLocale?: string }>
}) {
  const [{ lang, solutionSlug, categorySlug }, query, accessToken] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ __viewerDefaultLocale?: string }>({}),
    getInternalPreviewAccessToken()
  ])
  const activeLocale = query.__viewerDefaultLocale === '1' ? undefined : lang
  return accessToken
    ? <ViewerPortalPage activeLocale={activeLocale} categorySlug={categorySlug} preview={{ categorySlug: solutionSlug, accessToken }} />
    : <ViewerPortalPage activeLocale={activeLocale} solutionSlug={solutionSlug} categorySlug={categorySlug} />
}
