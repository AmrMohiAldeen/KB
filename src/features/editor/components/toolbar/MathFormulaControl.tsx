"use client";

import { FloatingPortal } from "@floating-ui/react";
import type { Editor } from "@tiptap/react";
import katex from "katex";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DropdownItem, ToolbarDropdown } from "./ToolbarPrimitives";
import { insertBlockFormula, insertInlineFormula } from "./mathFormulaActions";

type FormulaKind = "inline" | "block";

type PreviewState =
  | { status: "empty" }
  | { status: "invalid"; error: string }
  | { status: "valid"; html: string };

function getFormulaKindLabel(kind: FormulaKind) {
  return kind === "inline" ? "Inline formula" : "Block formula";
}

function getKatexErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "This formula could not be rendered.";
}

function renderFormulaPreview(latex: string, kind: FormulaKind): PreviewState {
  if (!latex) return { status: "empty" };

  try {
    return {
      status: "valid",
      html: katex.renderToString(latex, {
        displayMode: kind === "block",
        throwOnError: true,
      }),
    };
  } catch (error: unknown) {
    return {
      status: "invalid",
      error: getKatexErrorMessage(error),
    };
  }
}

function MathFormulaDialog({
  editor,
  kind,
  onClose,
}: {
  editor: Editor;
  kind: FormulaKind;
  onClose: () => void;
}) {
  const [latex, setLatex] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const inputId = useId();
  const headingId = useId();
  const errorId = useId();
  const previewId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formula = latex.trim();
  const preview = useMemo(
    () => renderFormulaPreview(formula, kind),
    [formula, kind],
  );
  const emptyError =
    submitAttempted && !formula ? "Enter a LaTeX formula." : "";
  const latexError = preview.status === "invalid" ? preview.error : "";
  const error = emptyError || latexError;
  const canInsert =
    editor.isEditable && Boolean(formula) && preview.status === "valid";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const insertFormula = () => {
    setSubmitAttempted(true);

    if (!formula) return;

    const currentPreview = renderFormulaPreview(formula, kind);

    if (currentPreview.status !== "valid") return;

    const inserted =
      kind === "inline"
        ? insertInlineFormula(editor, formula)
        : insertBlockFormula(editor, formula);

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
          className="w-full max-w-md rounded-md bg-white p-3 shadow-lg ring-1 ring-black/10"
          onSubmit={(event) => {
            event.preventDefault();
            insertFormula();
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
              {getFormulaKindLabel(kind)}
            </h2>
          </div>

          <label
            htmlFor={inputId}
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            LaTeX
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            value={latex}
            rows={4}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : previewId}
            onChange={(event) => {
              setLatex(event.target.value);
              setSubmitAttempted(false);
            }}
            className="min-h-24 w-full resize-y rounded border border-gray-300 px-2 py-1.5 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />

          {error && (
            <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
              {error}
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
              <div
                className="min-h-8 overflow-x-auto text-sm text-gray-900"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            ) : (
              <div className="min-h-8 text-xs text-gray-500" />
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

export function MathFormulaControl({ editor }: { editor: Editor }) {
  const [dialogKind, setDialogKind] = useState<FormulaKind | null>(null);

  return (
    <>
      <ToolbarDropdown
        title="Insert formula"
        label={<span className="font-serif text-sm">fx</span>}
        menuClassName="w-36"
      >
        <DropdownItem onActivate={() => setDialogKind("inline")}>
          Inline formula
        </DropdownItem>
        <DropdownItem onActivate={() => setDialogKind("block")}>
          Block formula
        </DropdownItem>
      </ToolbarDropdown>

      {dialogKind && (
        <MathFormulaDialog
          editor={editor}
          kind={dialogKind}
          onClose={() => setDialogKind(null)}
        />
      )}
    </>
  );
}
