"use client";

import { FloatingPortal } from "@floating-ui/react";
import type { Editor } from "@tiptap/react";
import { BookOpen } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  type GlossaryAttrs,
  normalizeGlossaryAttrs,
  sanitizeGlossaryText,
} from "../../extensions/Glossary";
import { ToolbarButton } from "./ToolbarPrimitives";

function getSelectionText(editor: Editor): string {
  const { from, to } = editor.state.selection;

  return sanitizeGlossaryText(
    editor.state.doc.textBetween(from, to, " "),
    120,
  );
}

function getGlossaryValidationError(
  term: string,
  definition: string,
): string {
  const sanitizedTerm = sanitizeGlossaryText(term, 120);
  const sanitizedDefinition = sanitizeGlossaryText(definition, 1000);

  if (!sanitizedTerm) return "Enter a term.";
  if (!sanitizedDefinition) return "Enter a definition.";

  return "";
}

function GlossaryDialog({
  editor,
  currentGlossary,
  initialTerm,
  onClose,
}: {
  editor: Editor;
  currentGlossary: GlossaryAttrs | null;
  initialTerm: string;
  onClose: () => void;
}) {
  const [term, setTerm] = useState(currentGlossary?.term ?? initialTerm);
  const [definition, setDefinition] = useState(currentGlossary?.definition ?? "");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const headingId = useId();
  const termInputId = useId();
  const definitionInputId = useId();
  const errorId = useId();
  const termInputRef = useRef<HTMLInputElement | null>(null);

  const validationError = getGlossaryValidationError(term, definition);
  const error = submitAttempted ? validationError : "";
  const canApply = editor.isEditable && !validationError;

  useEffect(() => {
    termInputRef.current?.focus();
    termInputRef.current?.select();
  }, []);

  const apply = () => {
    setSubmitAttempted(true);

    const attrs = normalizeGlossaryAttrs({
      term,
      definition,
      id: currentGlossary?.id,
    });

    if (!attrs) return;

    const applied = currentGlossary
      ? editor.chain().focus().updateGlossary(attrs).run()
      : editor.chain().focus().setGlossary(attrs).run();

    if (applied) onClose();
  };

  const remove = () => {
    const removed = editor.chain().focus().unsetGlossary().run();
    if (removed) onClose();
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
          className="w-full max-w-md rounded-md bg-white p-3 shadow-lg ring-1 ring-black/10"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
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
              {currentGlossary ? "Edit glossary term" : "Insert glossary term"}
            </h2>
          </div>

          <label
            htmlFor={termInputId}
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Term
          </label>
          <input
            ref={termInputRef}
            id={termInputId}
            value={term}
            type="text"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setTerm(event.target.value);
              setSubmitAttempted(false);
            }}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />

          <label
            htmlFor={definitionInputId}
            className="mb-1 mt-3 block text-xs font-medium text-gray-700"
          >
            Definition
          </label>
          <textarea
            id={definitionInputId}
            value={definition}
            rows={4}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setDefinition(event.target.value);
              setSubmitAttempted(false);
            }}
            className="min-h-24 w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />

          {error && (
            <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
              {error}
            </p>
          )}

          <div className="mt-3 flex justify-end gap-2">
            {currentGlossary && (
              <button
                type="button"
                onClick={remove}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Remove
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canApply}
              className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {currentGlossary ? "Update" : "Insert"}
            </button>
          </div>
        </form>
      </div>
    </FloatingPortal>
  );
}

export function GlossaryControl({
  editor,
  currentGlossary,
}: {
  editor: Editor;
  currentGlossary: GlossaryAttrs | null;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [initialTerm, setInitialTerm] = useState("");

  const openDialog = () => {
    setInitialTerm(currentGlossary?.term ?? getSelectionText(editor));
    setIsDialogOpen(true);
  };

  return (
    <>
      <ToolbarButton
        title="Glossary term"
        isActive={Boolean(currentGlossary)}
        disabled={!editor.isEditable}
        onActivate={openDialog}
      >
        <BookOpen size={16} aria-hidden="true" />
      </ToolbarButton>

      {isDialogOpen && (
        <GlossaryDialog
          editor={editor}
          currentGlossary={currentGlossary}
          initialTerm={initialTerm}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </>
  );
}
