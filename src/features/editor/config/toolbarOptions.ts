export type ToolbarOption = {
  label: string;
  value: string;
};

export type LineHeightValue = (typeof LINE_HEIGHTS)[number]['value'];

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


export const HEADING_OPTIONS = [
  { label: "Heading 1", shortLabel: "H1", level: 1 as const },
  { label: "Heading 2", shortLabel: "H2", level: 2 as const },
  { label: "Heading 3", shortLabel: "H3", level: 3 as const },
  { label: "Heading 4", shortLabel: "H4", level: 4 as const },
];

export function getTextBlockLabel(state: {
  isHeading1: boolean;
  isHeading2: boolean;
  isHeading3: boolean;
  isHeading4: boolean;
  isTextBlockMixed?: boolean;
}) {
  if (state.isTextBlockMixed) return "";
  if (state.isHeading1) return "H1";
  if (state.isHeading2) return "H2";
  if (state.isHeading3) return "H3";
  if (state.isHeading4) return "H4";

  return "Normal";
}

