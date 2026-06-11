"use client";

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import type { Editor } from "@tiptap/react";
import { useId, useState } from "react";
import { normalizeLinkUrl } from "./linkUrl";
import { ToolbarButton } from "./toolbar/ToolbarPrimitives";

export function LinkControl({
  editor,
  isActive,
  currentHref,
}: {
  editor: Editor;
  isActive: boolean;
  currentHref: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState(currentHref);
  const [error, setError] = useState("");
  const errorId = useId();
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const open = () => {
    setUrl(currentHref);
    setError("");
    setIsOpen(true);
  };

  const close = () => {
    setIsOpen(false);
    setError("");
  };

  const applyLink = () => {
    const result = normalizeLinkUrl(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: result.url }).run();
    close();
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    close();
  };

  return (
    <>
      <ToolbarButton
        ref={refs.setReference}
        title="Link"
        isActive={isActive}
        ariaHasPopup="dialog"
        ariaExpanded={isOpen}
        onActivate={() => (isOpen ? close() : open())}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      </ToolbarButton>

      {isOpen && (
        <FloatingPortal>
          <FloatingFocusManager context={context}>
            <form
              // Floating UI provides callback refs rather than mutable React refs.
              // eslint-disable-next-line react-hooks/refs
              ref={refs.setFloating}
              {...getFloatingProps({
                onSubmit: (event) => {
                  event.preventDefault();
                  applyLink();
                },
              })}
              className="z-50 w-80 rounded-md bg-white p-3 shadow-lg ring-1 ring-black/10"
              style={floatingStyles}
            >
              <label
                htmlFor="editor-link-url"
                className="mb-1 block text-xs font-medium text-gray-700"
              >
                Link URL
              </label>
              <input
                id="editor-link-url"
                type="text"
                inputMode="url"
                value={url}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setError("");
                }}
                placeholder="https://example.com"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              {error && (
                <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
                  {error}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                {isActive && (
                  <button
                    type="button"
                    onClick={removeLink}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Apply
                </button>
              </div>
            </form>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
