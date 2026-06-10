"use client"
import { useEditor, EditorContent } from '@tiptap/react';
import { getEditorExtensions } from '../extensions';
import EditorToolbar from './EditorToolbar'; 

export interface KnowledgeBaseEditorProps {
  onChange: (json: object) => void;
}

// DESIGN DECISION: Defined OUTSIDE the component function body.
// This provides a stable reference across lifecycle updates, preventing 
// Tiptap from seeing "new" extension arrays and throwing duplicate name warnings.
const extensions = getEditorExtensions();

export default function KnowledgeBaseEditor({  onChange }: KnowledgeBaseEditorProps) {
  const editor = useEditor({
    extensions, // Using the static reference defined above
    immediatelyRender: false, // Standard Next.js best practice
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-125 p-6 bg-white',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  if (!editor) {
    return <div className="animate-pulse bg-gray-50 h-125 rounded-lg border border-gray-200" />;
  }

  return (
    <div className="flex flex-col border border-gray-300 rounded-lg shadow-sm overflow-hidden bg-white">
      {/* Extracted Toolbar to prevent massive file bloat */}
      <EditorToolbar editor={editor} />
      
      {/* Scrollable Editor Canvas */}
      <div className="overflow-y-auto max-h-[70vh]">
        <div className="prose prose-base max-w-none">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}