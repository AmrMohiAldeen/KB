"use client";

import type { Content } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getEditorExtensions } from "../extensions";
import { EditorDragHandle } from "../extensions/EditorDragHandle";
import { ImageBubbleMenu } from "../blocks/image";
import type {
  EditorFileUploadAdapter,
  EditorFileUploadErrorHandler,
} from "../extensions/FileHandlerIntegration";
import EditorToolbar from "../components/toolbar/EditorToolbar";
import type { MediaLibraryApi } from "@/lib/api/mediaApi";
import type { EditorMediaUploadController } from "../media/mediaTypes";
import {
  sanitizeDraftMediaContent,
  sanitizeDraftMediaHtml,
} from "../media/mediaDocument";
import {
  type EditorChangeHandler,
  type EditorUpdateErrorHandler,
  useDebouncedEditorUpdate,
} from "../hooks/useDebouncedEditorUpdate";
import type { EditorCommentAnchor } from "../extensions/CommentAnchors";
import type {
  BlockCommentAnchor,
  CommentAnchorType,
  TextRangeCommentAnchor,
} from "@/types/apps/commentTypes";
import { MessageSquarePlus } from "lucide-react";

const DEFAULT_CHANGE_DEBOUNCE_MS = 1000;

class CommentExtensionBridge {
  private anchors: readonly EditorCommentAnchor[] = [];
  private activeThreadId: string | null = null;
  private onSelect?: (threadId: string) => void;

  update(
    anchors: readonly EditorCommentAnchor[],
    activeThreadId: string | null,
    onSelect?: (threadId: string) => void,
  ) {
    this.anchors = anchors;
    this.activeThreadId = activeThreadId;
    this.onSelect = onSelect;
  }

  getAnchors = () => this.anchors;
  getActiveThreadId = () => this.activeThreadId;
  select = (threadId: string) => this.onSelect?.(threadId);
}

class RuntimeExtensionBridge {
  private fileUploadAdapter?: EditorFileUploadAdapter;
  private fileUploadErrorHandler?: EditorFileUploadErrorHandler;
  private mediaContentLoader?: (mediaId: string) => Promise<Blob>;

  update(
    fileUploadAdapter?: EditorFileUploadAdapter,
    fileUploadErrorHandler?: EditorFileUploadErrorHandler,
    mediaContentLoader?: (mediaId: string) => Promise<Blob>,
  ) {
    this.fileUploadAdapter = fileUploadAdapter;
    this.fileUploadErrorHandler = fileUploadErrorHandler;
    this.mediaContentLoader = mediaContentLoader;
  }

  uploadFile: EditorFileUploadAdapter = (file, context) =>
    this.fileUploadAdapter?.(file, context);

  handleUploadError: EditorFileUploadErrorHandler = (error, file, context) =>
    this.fileUploadErrorHandler?.(error, file, context);

  loadMediaContent = (mediaId: string): Promise<Blob> => {
    const loader = this.mediaContentLoader;
    return loader
      ? loader(mediaId)
      : Promise.reject(new Error("No media content loader is configured."));
  };
}

export interface KnowledgeBaseEditorProps {
  onChange: EditorChangeHandler;
  onChangeError?: EditorUpdateErrorHandler;
  changeDebounceMs?: number;
  content?: Content;
  editable?: boolean;
  fileUploadAdapter?: EditorFileUploadAdapter;
  fileUploadErrorHandler?: EditorFileUploadErrorHandler;
  allowedFileMimeTypes?: readonly string[];
  mediaUploadController?: EditorMediaUploadController;
  mediaLibraryApi?: MediaLibraryApi;
  mediaAccessToken?: string;
  mediaContentLoader?: (mediaId: string) => Promise<Blob>;
  commentAnchors?: readonly EditorCommentAnchor[];
  activeCommentThreadId?: string | null;
  onSelectCommentThread?: (threadId: string) => void;
  canComment?: boolean;
  currentDraftId?: string | null;
  onAddCommentAnchor?: (
    anchorType: CommentAnchorType,
    anchorData: TextRangeCommentAnchor | BlockCommentAnchor,
  ) => void;
}

export default function KnowledgeBaseEditor({
  onChange,
  onChangeError,
  changeDebounceMs = DEFAULT_CHANGE_DEBOUNCE_MS,
  content,
  editable = true,
  fileUploadAdapter,
  fileUploadErrorHandler,
  allowedFileMimeTypes,
  mediaUploadController,
  mediaLibraryApi,
  mediaAccessToken,
  mediaContentLoader,
  commentAnchors = [],
  activeCommentThreadId = null,
  onSelectCommentThread,
  canComment = false,
  currentDraftId,
  onAddCommentAnchor,
}: KnowledgeBaseEditorProps) {
  const lastSerializableContent = useRef<string | null>(null);
  const [commentExtensionState] = useState(() => new CommentExtensionBridge());
  const [runtimeExtensionState] = useState(() => new RuntimeExtensionBridge());
  useEffect(() => {
    commentExtensionState.update(
      commentAnchors,
      activeCommentThreadId,
      onSelectCommentThread,
    );
  }, [
    activeCommentThreadId,
    commentAnchors,
    commentExtensionState,
    onSelectCommentThread,
  ]);
  useEffect(() => {
    runtimeExtensionState.update(
      fileUploadAdapter,
      fileUploadErrorHandler,
      mediaContentLoader,
    );
  }, [
    fileUploadAdapter,
    fileUploadErrorHandler,
    mediaContentLoader,
    runtimeExtensionState,
  ]);
  const scheduleChange = useDebouncedEditorUpdate(
    onChange,
    changeDebounceMs,
    onChangeError,
    (editor) => [
      sanitizeDraftMediaContent(editor.getJSON()),
      sanitizeDraftMediaHtml(editor.getHTML()),
      editor.getText(),
    ],
  );
  // Tiptap treats a changed extension array as a request to destroy and
  // recreate the Editor. Keep the schema/plugin set fixed for this component
  // lifetime; the bridges above carry the latest runtime callbacks without
  // invalidating the mounted ProseMirror view. Server content reloads already
  // remount this component explicitly through ArticleEditorShell.editorKey.
  const [extensions] = useState(() =>
    getEditorExtensions({
      mediaContentLoader: mediaContentLoader
        ? runtimeExtensionState.loadMediaContent
        : undefined,
      fileHandler: {
        adapter: fileUploadAdapter
          ? runtimeExtensionState.uploadFile
          : undefined,
        allowedMimeTypes: allowedFileMimeTypes
          ? [...allowedFileMimeTypes]
          : undefined,
        onUploadError: runtimeExtensionState.handleUploadError,
      },
      commentAnchors: {
        getAnchors: commentExtensionState.getAnchors,
        getActiveThreadId: commentExtensionState.getActiveThreadId,
        onSelect: commentExtensionState.select,
      },
    }),
  );

  const editor = useEditor(
    {
      extensions,
      content,
      immediatelyRender: false,
      editable,
      editorProps: {
        attributes: {
          class: "min-h-[520px] bg-white px-8 py-7 text-[15px] leading-7 text-slate-800 focus:outline-none md:px-12 md:py-10",
        },
      },
      onUpdate: ({ editor }) => {
        const serializable = JSON.stringify(
          sanitizeDraftMediaContent(editor.getJSON()),
        );
        if (serializable === lastSerializableContent.current) return;
        lastSerializableContent.current = serializable;
        scheduleChange(editor);
      },
      onCreate: ({ editor }) => {
        lastSerializableContent.current = JSON.stringify(
          sanitizeDraftMediaContent(editor.getJSON()),
        );
      },
    },
    [],
  );

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta("commentAnchors:refresh", true));
  }, [activeCommentThreadId, commentAnchors, editor]);

  const addCommentToSelection = useCallback(() => {
    if (!editor || !canComment || !currentDraftId || !onAddCommentAnchor) return;
    const { from, to, empty, $from } = editor.state.selection;
    if (!empty) {
      const selectedText = editor.state.doc.textBetween(from, to, "\n", "\n");
      if (!selectedText) return;
      const data: TextRangeCommentAnchor = {
        from,
        to,
        selectedText,
        prefix: editor.state.doc.textBetween(Math.max(1, from - 32), from, "\n", "\n"),
        suffix: editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + 32), "\n", "\n"),
      };
      onAddCommentAnchor("TextRange", data);
      return;
    }

    const position = $from.depth > 0 ? $from.before(1) : 0;
    const node = editor.state.doc.nodeAt(position);
    if (!node) return;
    const data: BlockCommentAnchor = {
      position,
      nodeType: node.type.name,
      text: node.textContent,
      blockId: typeof node.attrs.id === "string" ? node.attrs.id : null,
    };
    onAddCommentAnchor("Block", data);
  }, [canComment, currentDraftId, editor, onAddCommentAnchor]);

  if (!editor) {
    return (
      <div className="h-125 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
    );
  }

  return (
    <div className="kb-editor-frame flex flex-col overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm">
      {editable && <EditorDragHandle editor={editor} />}
      {editable && (
        <EditorToolbar
          editor={editor}
          mediaUploadController={mediaUploadController}
          mediaLibraryApi={mediaLibraryApi}
          mediaAccessToken={mediaAccessToken}
        />
      )}
      {canComment && currentDraftId && (
        <div className="flex items-center justify-end border-b border-gray-200 bg-slate-50 px-3 py-2">
          <button
            type="button"
            onClick={addCommentToSelection}
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            title="Add a comment to the selected text, or to the current block when no text is selected"
          >
            <MessageSquarePlus size={15} />
            Comment selection or block
          </button>
        </div>
      )}

      <div className="max-h-[72vh] overflow-y-auto">
        <div className="prose prose-base max-w-none">
          {editable && <ImageBubbleMenu editor={editor} />}
          <EditorContent editor={editor} className="kb-editor-content" />
        </div>
      </div>
    </div>
  );
}
