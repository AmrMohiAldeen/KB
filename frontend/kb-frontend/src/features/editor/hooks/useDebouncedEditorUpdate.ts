"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";
import { logDevError } from "../lib/utils/logDevError";

export type EditorChangeHandler = (
  content: JSONContent,
  renderedHtml?: string,
  plainText?: string,
) => void | Promise<void>;

export type EditorUpdateErrorHandler = (error: unknown) => void;
export type EditorSerializer = (
  editor: Editor,
) => [JSONContent, string | undefined, string | undefined];

export function useDebouncedEditorUpdate(
  onChange: EditorChangeHandler,
  delayMs: number,
  onError?: EditorUpdateErrorHandler,
  serialize?: EditorSerializer,
): (editor: Editor) => void {
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const serializeRef = useRef(serialize);
  const pendingEditorRef = useRef<Editor | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeDelayMs = Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 1000;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    serializeRef.current = serialize;
  }, [serialize]);

  const handleError = useCallback((error: unknown) => {
    if (onErrorRef.current) {
      onErrorRef.current(error);
      return;
    }

    logDevError("Failed to flush editor update", error);
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
    let renderedHtml: string | undefined;
    let plainText: string | undefined;

    try {
      if (serializeRef.current) {
        [content, renderedHtml, plainText] = serializeRef.current(editor);
      } else {
        content = editor.getJSON();
        const canRender = typeof editor.getHTML === "function" && typeof editor.getText === "function";
        renderedHtml = canRender ? editor.getHTML() : undefined;
        plainText = canRender ? editor.getText() : undefined;
      }
    } catch (error) {
      handleError(error);
      return;
    }

    try {
      const result = renderedHtml !== undefined || plainText !== undefined
        ? onChangeRef.current(content, renderedHtml, plainText)
        : onChangeRef.current(content);
      void Promise.resolve(result).catch(handleError);
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

      if (safeDelayMs === 0) {
        flush();
        return;
      }

      timeoutRef.current = setTimeout(flush, safeDelayMs);
    },
    [flush, safeDelayMs],
  );
}
