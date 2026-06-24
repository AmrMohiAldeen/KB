export type ToolbarOption = {
  label: string;
  value: string;
};

export const DEFAULT_FONT_FAMILY_LABEL = 'Arial';

export const FONT_FAMILIES: ToolbarOption[] = [
  { label: DEFAULT_FONT_FAMILY_LABEL, value: '' },

  // Loaded by next/font/google
  { label: 'Inter', value: 'var(--font-inter), Arial, sans-serif' },
  { label: 'Roboto', value: 'var(--font-roboto), Arial, sans-serif' },
  { label: 'EB Garamond', value: 'var(--font-eb-garamond), Georgia, serif' },

  // System fonts
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Consolas', value: 'Consolas, monospace' },
  { label: 'Monaco', value: 'Monaco, monospace' },
];

export function getFontFamilyLabel(fontFamily: string | null) {
  if (fontFamily === null) return '';
  if (!fontFamily) return DEFAULT_FONT_FAMILY_LABEL;

  return (
    FONT_FAMILIES.find((font) => font.value === fontFamily)?.label ??
    fontFamily.split(',')[0].replaceAll('"', '').replaceAll("'", '')
  );
}