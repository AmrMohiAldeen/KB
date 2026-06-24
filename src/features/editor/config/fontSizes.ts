import type { Editor } from "@tiptap/core";
import type { ToolbarOption } from "./toolbarOptions";

export const DEFAULT_FONT_SIZE = 11;
export type FontSizeDirection = 1 | -1;

export const FONT_SIZE_VALUES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 32, 36, 48, 64,
] as const;

export const FONT_SIZES: ToolbarOption[] = FONT_SIZE_VALUES.map((size) => ({
  label: String(size),
  value: `${size}px`,
}));

export function getFontSizeLabel(state: { fontSize: string | null }) {
  if (state.fontSize === null) return "";
  return state.fontSize.replace(/px$/i, "") || String(DEFAULT_FONT_SIZE);
}

export function getCurrentFontSize(editor: Editor) {
  const rawFontSize = String(editor.getAttributes("textStyle").fontSize ?? "");
  const parsedFontSize = Number.parseFloat(rawFontSize);

  return Number.isFinite(parsedFontSize) ? parsedFontSize : DEFAULT_FONT_SIZE;
}

export function getNextFontSize(
  currentSize: number,
  direction: FontSizeDirection,
) {
  if (direction === 1) {
    for (const size of FONT_SIZE_VALUES) {
      if (size > currentSize) return size;
    }

    return FONT_SIZE_VALUES[FONT_SIZE_VALUES.length - 1];
  }

  for (let i = FONT_SIZE_VALUES.length - 1; i >= 0; i -= 1) {
    const size = FONT_SIZE_VALUES[i];

    if (size < currentSize) return size;
  }

  return FONT_SIZE_VALUES[0];
}

export function normalizeFontSizeInput(value: number | string): string | null {
  const raw = String(value).trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem|%)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = match[2] ?? "px";
  const inRange =
    (unit === "px" && amount <= 300) ||
    (unit === "pt" && amount <= 225) ||
    ((unit === "em" || unit === "rem") && amount <= 20) ||
    (unit === "%" && amount <= 2000);

  if (!inRange) return null;

  return `${amount}${unit}`;
}

export function applyFontSize(editor: Editor, size: number | string) {
  const fontSize = normalizeFontSizeInput(size);
  if (!fontSize) return false;

  const isDefaultSize = fontSize === `${DEFAULT_FONT_SIZE}px`;
  const chain = editor
    .chain()
    .focus()
    .setEmptyCellDefaultMark("textStyle", {
      fontSize: isDefaultSize ? null : fontSize,
    }); // Empty table cells need default marks so newly typed text keeps the selected size.

  if (isDefaultSize) {
    return chain.unsetFontSize().run();
  }

  return chain.setFontSize(fontSize).run();
}

export function changeFontSize(editor: Editor, direction: FontSizeDirection) {
  const currentSize = getCurrentFontSize(editor);
  const nextSize = getNextFontSize(currentSize, direction);

  applyFontSize(editor, nextSize);
}
