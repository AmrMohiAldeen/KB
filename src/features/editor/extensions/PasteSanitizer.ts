import { Extension } from '@tiptap/core';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { sanitizePastedHTML } from '../paste/sanitizePastedHtml';

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
      .insertText(text)
      .scrollIntoView(),
  );

  return true;
}

export const PasteSanitizer = Extension.create({
  name: 'pasteSanitizer',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
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

              const cleanHtml = sanitizePastedHTML(html);

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

              const cleanHtml = sanitizePastedHTML(text);

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