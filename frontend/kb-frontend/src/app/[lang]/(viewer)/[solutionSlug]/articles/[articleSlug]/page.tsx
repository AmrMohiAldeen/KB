import ViewerArticlePage from '@/views/kb/viewer/ViewerArticlePage'

export default async function ViewerArticleRoute({ params }: {
  params: Promise<{ solutionSlug: string; articleSlug: string }>
}) {
  const { solutionSlug, articleSlug } = await params
  return <ViewerArticlePage solutionSlug={solutionSlug} articleSlug={articleSlug} />
}
