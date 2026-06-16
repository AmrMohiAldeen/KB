"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";

export type EditorChangeHandler = (
  content: JSONContent,
) => void | Promise<void>;

export type EditorUpdateErrorHandler = (error: unknown) => void;

export function useDebouncedEditorUpdate(
  onChange: EditorChangeHandler,
  delayMs: number,
  onError?: EditorUpdateErrorHandler,
): (editor: Editor) => void {
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const pendingEditorRef = useRef<Editor | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeDelayMs = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 1000;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const handleError = useCallback((error: unknown) => {
    if (onErrorRef.current) {
      onErrorRef.current(error);
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.error("Failed to flush editor update", error);
    }
  }, []);

  const flush = useCallback((): void => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const editor = pendingEditorRef.current;
    pendingEditorRef.current = null;

    if (!editor || editor.isDestroyed) {
      return;
    }

    let content: JSONContent;

    try {
      content = editor.getJSON();
    } catch (error) {
      handleError(error);
      return;
    }

    try {
      void Promise.resolve(onChangeRef.current(content)).catch(handleError);
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return useCallback(
    (editor: Editor): void => {
      pendingEditorRef.current = editor;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(flush, safeDelayMs);
    },
    [flush, safeDelayMs],
  );
}