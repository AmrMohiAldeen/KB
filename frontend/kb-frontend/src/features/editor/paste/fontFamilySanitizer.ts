import { FONT_FAMILIES } from '../config/fonts';

function isDangerousCssValue(value: string): boolean {
  const normalized = value.toLowerCase();

  return (
    normalized.includes('javascript:') ||
    normalized.includes('expression(') ||
    normalized.includes('url(') ||
    normalized.includes('@import') ||
    normalized.includes('behavior:')
  );
}

function normalizeFontToken(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeFontFamilyValue(value: string): string {
  return value
    .split(',')
    .map(normalizeFontToken)
    .filter(Boolean)
    .join(',');
}

const FONT_FAMILY_BY_FULL_VALUE = new Map(
  FONT_FAMILIES.filter((font) => font.value !== '').map((font) => [
    normalizeFontFamilyValue(font.value),
    font.value,
  ]),
);

const FONT_FAMILY_BY_NAME = new Map<string, string>([
  ['inter', 'var(--font-inter), Arial, sans-serif'],
  ['var(--font-inter)', 'var(--font-inter), Arial, sans-serif'],

  ['roboto', 'var(--font-roboto), Arial, sans-serif'],
  ['var(--font-roboto)', 'var(--font-roboto), Arial, sans-serif'],

  ['eb garamond', 'var(--font-eb-garamond), Georgia, serif'],
  ['var(--font-eb-garamond)', 'var(--font-eb-garamond), Georgia, serif'],

  ['arial', 'Arial, Helvetica, sans-serif'],
  ['helvetica', 'Helvetica, Arial, sans-serif'],
  ['segoe ui', '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'],
  ['times new roman', '"Times New Roman", serif'],
  ['georgia', 'Georgia, serif'],
  ['courier new', '"Courier New", monospace'],
  ['consolas', 'Consolas, monospace'],
  ['monaco', 'Monaco, monospace'],

  // Source migration fonts that are safe to preserve as system font stacks.
  ['tahoma', 'Tahoma, Arial, sans-serif'],
  ['open sans', '"Open Sans", Arial, sans-serif'],
  ['calibri', 'Calibri, Arial, sans-serif'],
  ['aptos', 'Aptos, Arial, sans-serif'],
]);

export function sanitizeFontFamily(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;
  if (isDangerousCssValue(trimmed)) return null;
  if (/[;{}<>]/.test(trimmed)) return null;

  const exactMatch = FONT_FAMILY_BY_FULL_VALUE.get(
    normalizeFontFamilyValue(trimmed),
  );

  if (exactMatch) return exactMatch;

  const firstFont = trimmed.split(',')[0];

  if (!firstFont) return null;

  return FONT_FAMILY_BY_NAME.get(normalizeFontToken(firstFont)) ?? null;
}
