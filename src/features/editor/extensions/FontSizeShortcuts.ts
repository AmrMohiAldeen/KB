// features/editor/extensions/FontSizeShortcuts.ts

import { Extension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { DEFAULT_FONT_SIZE, getNextFontSize } from "../components/toolbar/toolbarOptions";

type FontSizeDirection = 1 | -1;

function getCurrentFontSize(editor: Editor) {
  const rawFontSize = String(editor.getAttributes("textStyle").fontSize ?? "");
  const parsedFontSize = Number.parseInt(rawFontSize, 10);

  return Number.isFinite(parsedFontSize) ? parsedFontSize : DEFAULT_FONT_SIZE;
}

function applySizeChange(editor: Editor, direction: FontSizeDirection) {
  console.log("[FontSizeShortcuts] applySizeChange", { direction });

  const currentSize = getCurrentFontSize(editor);
  const nextSize = getNextFontSize(currentSize, direction);

  console.log("[FontSizeShortcuts] sizes", { currentSize, nextSize });

  const chain = editor.chain().focus().setParagraph();

  if (nextSize === DEFAULT_FONT_SIZE) {
    return chain.unsetFontSize().run();
  }

  return chain.setFontSize(`${nextSize}px`).run();
}

function isCtrlShiftOnly(event: KeyboardEvent) {
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
}

function isIncreaseShortcut(event: KeyboardEvent) {
  return (
    isCtrlShiftOnly(event) &&
    (event.key === ">" || event.key === "." || event.code === "Period")
  );
}

function isDecreaseShortcut(event: KeyboardEvent) {
  return (
    isCtrlShiftOnly(event) &&
    (event.key === "<" || event.key === "," || event.code === "Comma")
  );
}

export const FontSizeShortcuts = Extension.create({
  name: "fontSizeShortcuts",

  addProseMirrorPlugins() {
    console.log("[FontSizeShortcuts] plugin registered");

    const editor = this.editor;

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            keydown: (_view, event) => {
              console.log("[FontSizeShortcuts] keydown", {
                key: event.key,
                code: event.code,
                ctrl: event.ctrlKey,
                shift: event.shiftKey,
                alt: event.altKey,
                meta: event.metaKey,
              });

              if (isIncreaseShortcut(event)) {
                event.preventDefault();
                event.stopPropagation();
                applySizeChange(editor, 1);
                return true;
              }

              if (isDecreaseShortcut(event)) {
                event.preventDefault();
                event.stopPropagation();
                applySizeChange(editor, -1);
                return true;
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});