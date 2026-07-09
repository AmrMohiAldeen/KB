"use client";

import { FloatingPortal } from "@floating-ui/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ToolbarButton } from "./ToolbarPrimitives";

type ImagePreviewState =
  | { status: "empty" }
  | { status: "invalid"; error: string }
  | { status: "valid"; url: string };

type ImageLoadState = "idle" | "loading" | "loaded" | "failed";

type ImageLoadSnapshot = {
  status: ImageLoadState;
  url: string;
};

function isHttpImageUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getImagePreviewState(value: string): ImagePreviewState {
  const url = value.trim();

  if (!url) {
    return { status: "empty" };
  }

  if (!isHttpImageUrl(url)) {
    return {
      status: "invalid",
      error: "Enter a valid image URL starting with http:// or https://.",
    };
  }

  return {
    status: "valid",
    url,
  };
}

function insertImage({
  editor,
  src,
  alt,
  title,
}: {
  editor: Editor;
  src: string;
  alt: string;
  title: string;
}): boolean {
  if (!editor.isEditable) return false;

  return editor
    .chain()
    .focus()
    .setImage({
      src,
      alt: alt.trim() || undefined,
      title: title.trim() || undefined,
    })
    .run();
}

function ImageDialog({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [title, setTitle] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [imageLoadSnapshot, setImageLoadSnapshot] =
    useState<ImageLoadSnapshot>({ status: "idle", url: "" });

  const urlInputId = useId();
  const altInputId = useId();
  const titleInputId = useId();
  const headingId = useId();
  const errorId = useId();
  const helpId = useId();
  const previewId = useId();

  const urlInputRef = useRef<HTMLInputElement | null>(null);

  const preview = useMemo(() => getImagePreviewState(url), [url]);
  const imageLoadState =
    preview.status === "valid"
      ? imageLoadSnapshot.url === preview.url
        ? imageLoadSnapshot.status
        : "loading"
      : "idle";

  const emptyError =
    submitAttempted && preview.status === "empty" ? "Enter an image URL." : "";

  const validationError = preview.status === "invalid" ? preview.error : "";

  const loadError =
    imageLoadState === "failed"
      ? "The image could not be loaded. Check the URL."
      : "";

  const error = emptyError || validationError || loadError;

  const canInsert =
    editor.isEditable &&
    preview.status === "valid" &&
    imageLoadState !== "failed";

  useEffect(() => {
    urlInputRef.current?.focus();
  }, []);

  const submit = () => {
    setSubmitAttempted(true);

    const currentPreview = getImagePreviewState(url);

    if (currentPreview.status !== "valid") return;
    if (imageLoadState === "failed") return;

    const inserted = insertImage({
      editor,
      src: currentPreview.url,
      alt,
      title,
    });

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
              Insert image
            </h2>
          </div>

          <label
            htmlFor={urlInputId}
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Image URL
          </label>

          <input
            ref={urlInputRef}
            id={urlInputId}
            value={url}
            type="url"
            inputMode="url"
            placeholder="https://example.com/image.png"
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
              Use a direct online image URL. Upload support should be handled by
              the backend later.
            </p>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label
                htmlFor={altInputId}
                className="mb-1 block text-xs font-medium text-gray-700"
              >
                Alt text
              </label>

              <input
                id={altInputId}
                value={alt}
                type="text"
                placeholder="Describe the image"
                onChange={(event) => setAlt(event.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label
                htmlFor={titleInputId}
                className="mb-1 block text-xs font-medium text-gray-700"
              >
                Title
              </label>

              <input
                id={titleInputId}
                value={title}
                type="text"
                placeholder="Optional title"
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          <div
            id={previewId}
            className="mt-3 rounded border border-gray-200 bg-gray-50 p-2"
          >
            <div className="mb-1 text-[11px] font-medium text-gray-500">
              Preview
            </div>

            {preview.status === "valid" ? (
              <div className="flex min-h-48 items-center justify-center overflow-hidden rounded border border-gray-200 bg-white">
                {/* Arbitrary user-entered preview URLs cannot use configured Next image optimization. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt={alt || "Image preview"}
                  title={title || undefined}
                  className="max-h-72 max-w-full object-contain"
                  onLoad={() =>
                    setImageLoadSnapshot({
                      status: "loaded",
                      url: preview.url,
                    })
                  }
                  onError={() =>
                    setImageLoadSnapshot({
                      status: "failed",
                      url: preview.url,
                    })
                  }
                />
              </div>
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded border border-dashed border-gray-300 bg-white text-xs text-gray-500">
                Paste an image URL to preview it.
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

export function ImageControl({ editor }: { editor: Editor }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <ToolbarButton
        title="Insert image"
        disabled={!editor.isEditable}
        onActivate={() => setIsDialogOpen(true)}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Zm3 11 3.5-4 2.5 3 2-2.5 3 3.5M8.5 8.5h.01"
          />
        </svg>
      </ToolbarButton>

      {isDialogOpen && (
        <ImageDialog editor={editor} onClose={() => setIsDialogOpen(false)} />
      )}
    </>
  );
}
