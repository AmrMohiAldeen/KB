import { Extension } from '@tiptap/core';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  sanitizePastedHTMLWithResult,
  type PasteSanitizeResult,
} from './sanitizePastedHtml';
import { sanitizePastedPlainText } from './sanitizePastedText';
import { logDevError } from '../lib/utils/logDevError';

type PasteSanitizeFailure = Extract<PasteSanitizeResult, { ok: false }>;

export type PasteSanitizerFailureContext = {
  inputLength: number;
  reason: PasteSanitizeFailure['reason'];
  source: 'text/html' | 'text/plain-html';
  textLength: number;
};

export type PasteSanitizerOptions = {
  onSanitizeFailure?: (
    failure: PasteSanitizeFailure,
    context: PasteSanitizerFailureContext,
  ) => void;
};

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value.trim());
}

function isInsideCodeBlock(view: EditorView): boolean {
  const { $from } = view.state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.code) {
      return true;
    }
  }

  return false;
}

function insertHtml(view: EditorView, html: string): boolean {
  const container = document.createElement('div');
  container.innerHTML = html;

  const slice = ProseMirrorDOMParser
    .fromSchema(view.state.schema)
    .parseSlice(container);

  view.dispatch(
    view.state.tr
      .replaceSelection(slice)
      .scrollIntoView(),
  );

  return true;
}

function insertPlainText(view: EditorView, text: string): boolean {
  view.dispatch(
    view.state.tr
      .insertText(sanitizePastedPlainText(text))
      .scrollIntoView(),
  );

  return true;
}

function reportSanitizeFailure(
  failure: PasteSanitizeFailure,
  context: PasteSanitizerFailureContext,
  options: PasteSanitizerOptions,
): void {
  options.onSanitizeFailure?.(failure, context);

  if (!options.onSanitizeFailure) {
    logDevError(
      'Paste sanitization rejected clipboard HTML:',
      new Error(failure.reason),
    );
  }
}

function sanitizeForPaste(
  input: string,
  context: Omit<PasteSanitizerFailureContext, 'reason'>,
  options: PasteSanitizerOptions,
): string | null {
  const result = sanitizePastedHTMLWithResult(input);
  if (result.ok) return result.html;

  reportSanitizeFailure(
    result,
    { ...context, reason: result.reason },
    options,
  );
  return null;
}

export const PasteSanitizer = Extension.create<PasteSanitizerOptions>({
  name: 'pasteSanitizer',

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        props: {
          transformPastedText(text) {
            return sanitizePastedPlainText(text);
          },

          handlePaste(view, event) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            const html = clipboardData.getData('text/html');
            const text = clipboardData.getData('text/plain');

            // Do not convert HTML-looking text inside code blocks.
            // In code blocks, users usually expect pasted HTML to remain source code.
            if (isInsideCodeBlock(view)) {
              return false;
            }

            // Case 1: real rich HTML paste from browser, Word, Google Docs, etc.
            if (html.trim()) {
              event.preventDefault();

              const cleanHtml = sanitizeForPaste(
                html,
                {
                  inputLength: html.length,
                  source: 'text/html',
                  textLength: text.length,
                },
                options,
              );

              if (cleanHtml == null) return true;

              if (cleanHtml.trim()) {
                return insertHtml(view, cleanHtml);
              }

              if (text.trim()) {
                return insertPlainText(view, text);
              }

              return true;
            }

            // Case 2: user copied literal HTML source as plain text.
            // Example: copying `<h1>Hello</h1>` from VS Code or a ChatGPT code block.
            if (text.trim() && looksLikeHtml(text)) {
              event.preventDefault();

              const cleanHtml = sanitizeForPaste(
                text,
                {
                  inputLength: text.length,
                  source: 'text/plain-html',
                  textLength: text.length,
                },
                options,
              );

              if (cleanHtml == null) return insertPlainText(view, text);

              if (cleanHtml.trim()) {
                return insertHtml(view, cleanHtml);
              }

              return insertPlainText(view, text);
            }

            // Normal plain text paste.
            return false;
          },
        },
      }),
    ];
  },
});
