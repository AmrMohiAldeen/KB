import type { Editor } from "@tiptap/react";

export type ToolbarOption = {
  label: string;
  value: string;
};

export type LineHeightValue = (typeof LINE_HEIGHTS)[number]['value'];
export type FontSizeDirection = 1 | -1;

export const DEFAULT_FONT_FAMILY_LABEL = "Arial";
export const DEFAULT_FONT_SIZE = 11;
export const DEFAULT_LINE_HEIGHT = '1';

export const LINE_HEIGHTS: ToolbarOption[] = [
  { label: '0.25', value: '0.25' },
  { label: '0.75', value: '0.75' },
  { label: '1.0', value: '1' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
];

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

  // Loaded by next/font/google
  { label: "Inter", value: "var(--font-inter), Arial, sans-serif" },
  { label: "Roboto", value: "var(--font-roboto), Arial, sans-serif" },
  { label: "EB Garamond", value: "var(--font-eb-garamond), Georgia, serif" },

  // System fonts
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Segoe UI", value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' },
  { label: "Times New Roman", value: '"Times New Roman", serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: '"Courier New", monospace' },
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

export function getFontFamilyLabel(fontFamily: string | null) {
  if (fontFamily === null) return "";
  if (!fontFamily) return DEFAULT_FONT_FAMILY_LABEL;

  return (
    FONT_FAMILIES.find((font) => font.value === fontFamily)?.label ??
    fontFamily.split(",")[0].replaceAll('"', "").replaceAll("'", "")
  );
}

export function getTextBlockLabel(state: {
  isHeading1: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  isTextBlockMixed?: boolean;
}) {
  if (state.isTextBlockMixed) return "";
  if (state.isHeading1) return "H1";
  if (state.isHeading2) return "H2";
  if (state.isHeading3) return "H3";

  return "Normal";
}

export function getFontSizeLabel(state: { fontSize: string | null }) {
  if (state.fontSize === null) return "";
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
  const chain = editor
    .chain()
    .focus()
    .setEmptyCellDefaultMark("textStyle", {
      fontSize: size === DEFAULT_FONT_SIZE ? null : `${size}px`,
    }); // Empty table cells need default marks so newly typed text keeps the selected size.

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
