"use client";

import type { JSONContent } from "@tiptap/core";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { KnowledgeBaseEditorProps } from "./components/KnowledgeBaseEditor";

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(
  () => import("./components/KnowledgeBaseEditor"),
  { ssr: false },
);

type SaveStatus = "idle" | "saving" | "saved" | "failed";

export default function EditorWorkspace() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const handleContentChange = useCallback(async (jsonContent: JSONContent) => {
    setSaveStatus("saving");

    try {
      // TODO: replace this with real backend autosave later
      console.log("Autosaving editor content:", jsonContent);

      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("failed");
      throw error;
    }
  }, []);

  const handleAutosaveError = useCallback((error: unknown) => {
    setSaveStatus("failed");

    if (process.env.NODE_ENV === "development") {
      console.error("Editor autosave failed", error);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-2">
      <div className="text-sm text-gray-500">
        {saveStatus === "saving" && "Saving..."}
        {saveStatus === "saved" && "Saved"}
        {saveStatus === "failed" && "Autosave failed"}
      </div>
      //todo: useAsync implement
      <EditorCanvas
        onChange={handleContentChange}
        onChangeError={handleAutosaveError}
      />
    </div>
  );
}