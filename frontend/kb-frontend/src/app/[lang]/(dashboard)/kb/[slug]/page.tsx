// View Imports
import PublicArticleViewerPage from '@/views/kb/public/PublicArticleViewerPage'
import { notFound } from 'next/navigation'
import { ApiError } from '@/lib/api/http'
import { getPublicArticle } from '@/lib/api/publicKnowledgeBaseApi'

export default async function KbArticlePage({
  params
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  let article

  try {
    article = await getPublicArticle(slug)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  return <PublicArticleViewerPage lang={lang} slug={slug} initialArticle={article} />
}
