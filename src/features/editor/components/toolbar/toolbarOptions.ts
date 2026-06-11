import type { Editor } from "@tiptap/react";

export type ToolbarOption = {
  label: string;
  value: string;
};

export type FontSizeDirection = 1 | -1;

export const DEFAULT_FONT_FAMILY_LABEL = "Arial";
export const DEFAULT_FONT_SIZE = 11;

export const TEXT_COLORS: ToolbarOption[] = [
  { label: "Black", value: "#111827" },
  { label: "Gray", value: "#6b7280" },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Yellow", value: "#ca8a04" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#9333ea" },
];

export const HIGHLIGHT_COLORS: ToolbarOption[] = [
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Purple", value: "#e9d5ff" },
  { label: "Red", value: "#fecaca" },
  { label: "Orange", value: "#fed7aa" },
];

export const FONT_FAMILIES: ToolbarOption[] = [
  { label: DEFAULT_FONT_FAMILY_LABEL, value: "" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Segoe UI", value: "Segoe UI, sans-serif" },
  { label: "Times New Roman", value: "Times New Roman, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Courier New", value: "Courier New, monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
];

export const HEADING_OPTIONS = [
  { label: "Heading 1", shortLabel: "H1", level: 1 as const },
  { label: "Heading 2", shortLabel: "H2", level: 2 as const },
  { label: "Heading 3", shortLabel: "H3", level: 3 as const },
];

export const FONT_SIZE_VALUES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 32, 36, 48, 64,
] as const;

export const FONT_SIZES: ToolbarOption[] = FONT_SIZE_VALUES.map((size) => ({
  label: String(size),
  value: `${size}px`,
}));

export function getFontFamilyLabel(fontFamily: string) {
  if (!fontFamily) return DEFAULT_FONT_FAMILY_LABEL;

  return (
    FONT_FAMILIES.find((font) => font.value === fontFamily)?.label ??
    fontFamily.split(",")[0].replaceAll('"', "").replaceAll("'", "")
  );
}

export function getTextSizeLabel(state: {
  isHeading1: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  fontSize: string;
}) {
  if (state.isHeading1) return "H1";
  if (state.isHeading2) return "H2";
  if (state.isHeading3) return "H3";

  return state.fontSize.replace("px", "") || String(DEFAULT_FONT_SIZE);
}

export function getCurrentFontSize(editor: Editor) {
  const rawFontSize = String(editor.getAttributes("textStyle").fontSize ?? "");
  const parsedFontSize = Number.parseInt(rawFontSize, 10);

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

export function applyFontSize(editor: Editor, size: number) {
  const chain = editor.chain().focus().setParagraph();

  if (size === DEFAULT_FONT_SIZE) {
    chain.unsetFontSize().run();
    return;
  }

  chain.setFontSize(`${size}px`).run();
}

export function changeFontSize(editor: Editor, direction: FontSizeDirection) {
  const currentSize = getCurrentFontSize(editor);
  const nextSize = getNextFontSize(currentSize, direction);

  applyFontSize(editor, nextSize);
}
