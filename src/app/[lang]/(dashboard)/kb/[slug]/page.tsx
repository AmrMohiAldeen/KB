import PublicArticleViewerPage from '@/views/kb/PublicArticleViewerPage'

export default async function KbArticlePage({
  params
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params

  return <PublicArticleViewerPage lang={lang} slug={slug} />
}

