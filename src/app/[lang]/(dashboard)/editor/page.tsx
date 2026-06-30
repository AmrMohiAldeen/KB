// View Imports
import ArticleEditorShell from '@/views/kb/editor/ArticleEditorShell'

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params

  return <ArticleEditorShell lang={lang} />
}
