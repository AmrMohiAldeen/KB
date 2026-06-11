"use client";

import type { JSONContent } from "@tiptap/core";
import dynamic from "next/dynamic";
import type { KnowledgeBaseEditorProps } from "./components/KnowledgeBaseEditor";

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(
  () => import("./components/KnowledgeBaseEditor"),
  { ssr: false },
);

export default function EditorWorkspace() {
  const handleContentChange = (jsonContent: JSONContent) => {
    void jsonContent;
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <EditorCanvas onChange={handleContentChange} />
    </div>
  );
}
