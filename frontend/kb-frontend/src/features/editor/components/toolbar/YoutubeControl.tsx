"use client";

import { FloatingPortal } from "@floating-ui/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ToolbarButton } from "./ToolbarPrimitives";

const DEFAULT_YOUTUBE_WIDTH = 640;
const DEFAULT_YOUTUBE_HEIGHT = 360;

type YoutubePreviewState =
  | { status: "empty" }
  | { status: "invalid"; error: string }
  | { status: "valid"; videoId: string; canonicalUrl: string; previewUrl: string };

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function normalizeYoutubeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;

  const candidate = value.trim();

  if (!YOUTUBE_VIDEO_ID_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

function getYoutubeVideoId(value: string): string | null {
  const input = value.trim();

  if (!input) return null;

  // Allow advanced users to paste only the video ID.
  const rawVideoId = normalizeYoutubeVideoId(input);
  if (rawVideoId) return rawVideoId;

  try {
    const url = new URL(input);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    const hostname = normalizeHostname(url.hostname);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (hostname === "youtu.be") {
      return normalizeYoutubeVideoId(pathParts[0]);
    }

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return normalizeYoutubeVideoId(url.searchParams.get("v"));
      }

      if (
        pathParts[0] === "embed" ||
        pathParts[0] === "shorts" ||
        pathParts[0] === "live" ||
        pathParts[0] === "v"
      ) {
        return normalizeYoutubeVideoId(pathParts[1]);
      }
    }

    if (hostname === "youtube-nocookie.com" && pathParts[0] === "embed") {
      return normalizeYoutubeVideoId(pathParts[1]);
    }

    return null;
  } catch {
    return null;
  }
}

function getCanonicalYoutubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function getYoutubePreviewUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

function getYoutubePreviewState(value: string): YoutubePreviewState {
  const input = value.trim();

  if (!input) {
    return { status: "empty" };
  }

  const videoId = getYoutubeVideoId(input);

  if (!videoId) {
    return {
      status: "invalid",
      error:
        "Enter a valid YouTube link, for example https://www.youtube.com/watch?v=VIDEO_ID.",
    };
  }

  return {
    status: "valid",
    videoId,
    canonicalUrl: getCanonicalYoutubeUrl(videoId),
    previewUrl: getYoutubePreviewUrl(videoId),
  };
}

function insertYoutubeVideo(editor: Editor, src: string): boolean {
  if (!editor.isEditable) return false;

  return editor
    .chain()
    .focus()
    .setYoutubeVideo({
      src,
      width: DEFAULT_YOUTUBE_WIDTH,
      height: DEFAULT_YOUTUBE_HEIGHT,
    })
    .run();
}

function YoutubeDialog({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const inputId = useId();
  const headingId = useId();
  const errorId = useId();
  const helpId = useId();
  const previewId = useId();

  const inputRef = useRef<HTMLInputElement | null>(null);

  const preview = useMemo(() => getYoutubePreviewState(url), [url]);

  const emptyError =
    submitAttempted && preview.status === "empty"
      ? "Enter a YouTube link."
      : "";

  const validationError =
    preview.status === "invalid" ? preview.error : "";

  const error = emptyError || validationError;

  const canInsert = editor.isEditable && preview.status === "valid";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    setSubmitAttempted(true);

    const currentPreview = getYoutubePreviewState(url);

    if (currentPreview.status !== "valid") return;

    const inserted = insertYoutubeVideo(editor, currentPreview.canonicalUrl);

    if (inserted) {
      onClose();
    }
  };

  return (
    <FloatingPortal>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/10 px-4 py-20"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className="w-full max-w-lg rounded-md bg-white p-3 shadow-lg ring-1 ring-black/10"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        >
          <div className="mb-2">
            <h2 id={headingId} className="text-sm font-semibold text-gray-900">
              Insert YouTube video
            </h2>
          </div>

          <label
            htmlFor={inputId}
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            YouTube link
          </label>

          <input
            ref={inputRef}
            id={inputId}
            value={url}
            type="text"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : helpId}
            onChange={(event) => {
              setUrl(event.target.value);
              setSubmitAttempted(false);
            }}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />

          {error ? (
            <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
              {error}
            </p>
          ) : (
            <p id={helpId} className="mt-1 text-xs text-gray-500">
              Supports normal YouTube links, youtu.be links, Shorts, embed links,
              and raw video IDs.
            </p>
          )}

          <div
            id={previewId}
            className="mt-3 rounded border border-gray-200 bg-gray-50 p-2"
          >
            <div className="mb-1 text-[11px] font-medium text-gray-500">
              Preview
            </div>

            {preview.status === "valid" ? (
              <div className="overflow-hidden rounded border border-gray-200 bg-black">
                <iframe
                  className="aspect-video w-full"
                  src={preview.previewUrl}
                  title="YouTube video preview"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded border border-dashed border-gray-300 bg-white text-xs text-gray-500">
                Paste a YouTube link to preview the video.
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canInsert}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Insert
            </button>
          </div>
        </form>
      </div>
    </FloatingPortal>
  );
}

export function YoutubeControl({ editor }: { editor: Editor }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <ToolbarButton
        title="Insert YouTube video"
        disabled={!editor.isEditable}
        onActivate={() => setIsDialogOpen(true)}
      >
        <svg
          className="h-4 w-4"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M21.58 7.19a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.82.42A2.5 2.5 0 0 0 2.42 7.2C2 8.76 2 12 2 12s0 3.24.42 4.81a2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.82-.42a2.5 2.5 0 0 0 1.76-1.77C22 15.24 22 12 22 12s0-3.24-.42-4.81ZM10 15V9l5.2 3L10 15Z" />
        </svg>
      </ToolbarButton>

      {isDialogOpen && (
        <YoutubeDialog
          editor={editor}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </>
  );
}