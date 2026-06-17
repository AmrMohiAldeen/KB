"use client";

import type { Content } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo } from "react";
import { getEditorExtensions } from "../extensions";

export interface KnowledgeBaseViewerProps {
  content: Content;
}

export default function KnowledgeBaseViewer({
  content,
}: KnowledgeBaseViewerProps) {
  const extensions = useMemo(
    () =>
      getEditorExtensions({
        featureFlags: {
          fileHandler: false,
        },
      }),
    [],
  );

  const editor = useEditor(
    {
      content,
      editable: false,
      extensions,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "kb-viewer focus:outline-none",
        },
      },
    },
    [extensions],
  );

  useEffect(() => {
    editor?.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="prose prose-base max-w-none">
      <EditorContent editor={editor} />
    </div>
  );
}
