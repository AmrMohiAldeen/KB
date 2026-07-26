// View Imports
import ArticleEditorShell from '@/views/kb/editor/ArticleEditorShell'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ articleId?: string }>
}) {
  const { lang } = await params
  const { articleId = '' } = await searchParams
  const accessToken = await getServerAccessToken()

  return <ArticleEditorShell lang={lang} articleId={articleId} accessToken={accessToken} />
}
