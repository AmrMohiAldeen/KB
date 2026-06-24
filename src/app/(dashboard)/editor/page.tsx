import EditorWorkspace from '@/features/editor/core/EditorWorkspace';

export default async function Page() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">My first text editor</h1>
      <EditorWorkspace />
    </main>
  );
}
