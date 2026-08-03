import MediaLibraryPage from '@/views/kb/media/MediaLibraryPage'

export default async function MediaPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params

  return <MediaLibraryPage locale={lang} />
}
