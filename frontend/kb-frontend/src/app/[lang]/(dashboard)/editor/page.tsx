// View Imports
import ArticleEditorShell from '@/views/kb/editor/ArticleEditorShell'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ articleId?: string; restoredFromVersion?: string; sourceArticleId?: string }>
}) {
  const { lang } = await params
  const { articleId = '', restoredFromVersion, sourceArticleId } = await searchParams
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }

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
