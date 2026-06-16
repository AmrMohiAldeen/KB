"use client";

import type { Content } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { getEditorExtensions } from "../extensions";
import EditorToolbar from "./toolbar/EditorToolbar";
import {
  type EditorChangeHandler,
  type EditorUpdateErrorHandler,
  useDebouncedEditorUpdate,
} from "./useDebouncedEditorUpdate";

const DEFAULT_CHANGE_DEBOUNCE_MS = 1000;
const extensions = getEditorExtensions();

export interface KnowledgeBaseEditorProps {
  onChange: EditorChangeHandler;
  onChangeError?: EditorUpdateErrorHandler;
  changeDebounceMs?: number;
  content?: Content;
  editable?: boolean;
}

export default function KnowledgeBaseEditor({
  onChange,
  onChangeError,
  changeDebounceMs = DEFAULT_CHANGE_DEBOUNCE_MS,
  content,
  editable = true,
}: KnowledgeBaseEditorProps) {
  const scheduleChange = useDebouncedEditorUpdate(onChange, changeDebounceMs, onChangeError,);

  const editor = useEditor({
    extensions,
    content,
    immediatelyRender: false,
    editable,
    editorProps: {
      attributes: {
        class: "min-h-125 bg-white p-6 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      scheduleChange(editor);
    },
  });

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editable, editor]);

  if (!editor) {
    return (
      <div className="h-125 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
      {editable && <EditorToolbar editor={editor} />}

      <div className="max-h-[70vh] overflow-y-auto">
        <div className="prose prose-base max-w-none">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
