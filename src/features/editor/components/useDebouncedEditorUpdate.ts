"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";

export type EditorChangeHandler = (content: JSONContent) => void;

export function useDebouncedEditorUpdate(
  onChange: EditorChangeHandler,
  delayMs: number,
): (editor: Editor) => void {
  const onChangeRef = useRef(onChange);
  const pendingEditorRef = useRef<Editor | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const editor = pendingEditorRef.current;
    pendingEditorRef.current = null;

    if (editor && !editor.isDestroyed) {
      onChangeRef.current(editor.getJSON());
    }
  }, []);

  useEffect(() => flush, [flush]);

  return useCallback(
    (editor: Editor) => {
      pendingEditorRef.current = editor;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );
}
