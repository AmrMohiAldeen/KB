import EditorWorkspace from '@/features/editor/core/EditorWorkspace';

export default async function Page() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Article editor</h1>
      {/* TODO: Replace with backend API call to GET /api/kb/articles/{articleId}/draft.
          Expected response: ArticleDraft metadata including id, articleId, contentStoragePath, IsLocked, LockedByUserIdNullable, LockedAt, and RowVersion. */}
      <EditorWorkspace />
    </main>
  );
}
