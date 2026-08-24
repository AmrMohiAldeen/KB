// View Imports
import ArticleEditorShell from '@/views/kb/editor/ArticleEditorShell'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ articleId?: string; restoredFromVersion?: string; sourceArticleId?: string }>
}) {
  const { lang } = await params
  const { articleId = '', restoredFromVersion, sourceArticleId } = await searchParams
  const accessToken = await getServerAccessToken()

  return (
    <ArticleEditorShell
      lang={lang}
      articleId={articleId}
      accessToken={accessToken}
      restoredFromVersion={restoredFromVersion}
      sourceArticleId={sourceArticleId}
    />
  )
}
