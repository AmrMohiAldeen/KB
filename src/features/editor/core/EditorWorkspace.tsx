"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { logDevError } from "../lib/utils/logDevError";
import type { KnowledgeBaseEditorProps } from "./KnowledgeBaseEditor";

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(
  () => import("./KnowledgeBaseEditor"),
  { ssr: false },
);

type SaveStatus = "idle" | "saving" | "saved" | "failed";

export default function EditorWorkspace() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const handleContentChange = useCallback(async () => {
    setSaveStatus("saving");

    try {
      // TODO: replace this with real backend autosave later
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("failed");
      throw error;
    }
  }, []);

  const handleAutosaveError = useCallback((error: unknown) => {
    setSaveStatus("failed");
    logDevError("Editor autosave failed", error);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-2">
      <div className="text-sm text-gray-500">
        {saveStatus === "saving" && "Saving..."}
        {saveStatus === "saved" && "Saved"}
        {saveStatus === "failed" && "Autosave failed"}
      </div>

      <EditorCanvas
        onChange={handleContentChange}
        onChangeError={handleAutosaveError}
         editable={false}
      />
    </div>
  );
}
