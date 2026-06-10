"use client";

import dynamic from 'next/dynamic';
import type { KnowledgeBaseEditorProps } from './components/KnowledgeBaseEditor';

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(
  () => import('./components/KnowledgeBaseEditor'),
  { ssr: false }
);

export default function EditorWorkspace( ) {
  const handleContentChange = (jsonContent: object) => {
    console.log('Updated Tiptap JSON Schema:', jsonContent);
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <EditorCanvas 
        onChange={handleContentChange} 
      />
    </div>
  );
}