import { normalizeCalloutVariant } from '../contentBlocks/callout/model';
import { normalizeLinkUrl } from '../components/linkUrl';
import { getTagName } from './domUtils';
import { readTableOffsetPercent, readTableWidthPercent } from './normalizeTables';
import {
  ALLOWED_EXPLICIT_URL_PROTOCOLS,
  BLOCK_TEXT_ALIGN_VALUES,
  BULLET_LIST_STYLES,
  CELL_TEXT_ALIGN_VALUES,
  CSS_DANGER_PATTERN,
  DETAILS_KB_ATTRIBUTE_NAMES,
  DIV_KB_ATTRIBUTE_NAMES,
  INLINE_TAGS,
  ORDERED_LIST_STYLES,
  SECTION_KB_ATTRIBUTE_NAMES,
  TABLE_BORDER_ATTRIBUTES,
  TEXT_ALIGN_STYLE_TAGS,
} from './pasteSanitizerConfig';
import type { SanitizedUrl } from './pasteSanitizerTypes';

function decodeCssEscapes(value: string): string {
  return value.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_, escape: string) => {
    const hex = escape.match(/^[0-9a-fA-F]{1,6}/)?.[0];
    if (!hex) return escape;

    const codePoint = Number.parseInt(hex, 16);
    if (!Number.isFinite(codePoint) || codePoint <= 0) return '';

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return '';
    }
  });
}

function isDangerousCssValue(value: string): boolean {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, '');
  const decoded = decodeCssEscapes(withoutComments);
  const compact = decoded.replace(/[\u0000-\u001F\u007F\s]+/g, '');

  return [withoutComments, decoded, compact].some((candidate) =>
    CSS_DANGER_PATTERN.test(candidate),
  );
}

function sanitizeCssColor(
  document: Document,
  value: string,
  options: { allowTransparent?: boolean } = {},
): string | null {
  const trimmed = value.trim().replace(/['"]/g, '');
  if (!trimmed || isDangerousCssValue(trimmed)) return null;
  if (/^(?:inherit|initial|revert|unset|currentcolor)$/i.test(trimmed)) return null;
  if (!options.allowTransparent && /^transparent$/i.test(trimmed)) return null;

  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = trimmed;

  return probe.style.color || null;
}

function sanitizeFontSize(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (isDangerousCssValue(trimmed)) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) return null;

  const inRange =
    (unit === 'px' && amount >= 8 && amount <= 48) ||
    (unit === 'pt' && amount >= 6 && amount <= 36) ||
    ((unit === 'em' || unit === 'rem') && amount >= 0.5 && amount <= 3) ||
    (unit === '%' && amount >= 50 && amount <= 300);

  return inRange ? `${amount}${unit}` : null;
}

function sanitizeLineHeight(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'normal') return trimmed;
  if (isDangerousCssValue(trimmed)) return null;

  const unitless = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (unitless) {
    const amount = Number(unitless[1]);
    return amount >= 1 && amount <= 3 ? String(amount) : null;
  }

  const length = trimmed.match(/^(\d+(?:\.\d+)?)(px|%)$/);
  if (!length) return null;

  const amount = Number(length[1]);
  const unit = length[2];
  const inRange =
    (unit === 'px' && amount >= 12 && amount <= 72) ||
    (unit === '%' && amount >= 80 && amount <= 300);

  return inRange ? `${amount}${unit}` : null;
}

function sanitizeFontWeight(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (/^(?:bold|bolder)$/.test(trimmed)) return trimmed;
  if (/^[5-9]00$/.test(trimmed)) return trimmed;

  return null;
}

function sanitizeTextDecoration(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (isDangerousCssValue(trimmed)) return null;

  const hasUnderline = /\bunderline\b/.test(trimmed);
  const hasLineThrough = /\bline-through\b/.test(trimmed);
  const values: string[] = [];

  if (hasUnderline) values.push('underline');
  if (hasLineThrough) values.push('line-through');

  return values.length > 0 ? values.join(' ') : null;
}

function sanitizeTextAlign(value: string, element: HTMLElement): string | null {
  const trimmed = value.trim().toLowerCase();
  const tagName = getTagName(element);

  if (tagName === 'td' || tagName === 'th') {
    return CELL_TEXT_ALIGN_VALUES.has(trimmed) ? trimmed : null;
  }

  return BLOCK_TEXT_ALIGN_VALUES.has(trimmed) ? trimmed : null;
}

function sanitizeListStyleType(value: string, element: HTMLElement): string | null {
  const trimmed = value.trim().toLowerCase();
  const tagName = getTagName(element);

  if (tagName === 'ol') {
    return ORDERED_LIST_STYLES.has(trimmed) ? trimmed : null;
  }

  if (tagName === 'ul') {
    return BULLET_LIST_STYLES.has(trimmed) ? trimmed : null;
  }

  return null;
}

function sanitizePercentStyle(value: string): string | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!match) return null;

  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount >= 0 && amount <= 100
    ? `${amount}%`
    : null;
}

function sanitizeStyleProperty(
  element: HTMLElement,
  property: string,
  value: string,
): string | null {
  const tagName = getTagName(element);
  const document = element.ownerDocument;
  const normalizedProperty = property.toLowerCase();

  if (!value.trim() || isDangerousCssValue(value)) return null;

  if (normalizedProperty === 'color') {
    return sanitizeCssColor(document, value);
  }

  if (normalizedProperty === 'background-color') {
    if (!INLINE_TAGS.has(tagName) && tagName !== 'td' && tagName !== 'th') {
      return null;
    }

    return sanitizeCssColor(document, value, { allowTransparent: false });
  }

  if (normalizedProperty === 'font-size') return sanitizeFontSize(value);
  if (normalizedProperty === 'line-height') return sanitizeLineHeight(value);
  if (normalizedProperty === 'font-weight') return sanitizeFontWeight(value);
  if (normalizedProperty === 'font-style') {
    return value.trim().toLowerCase() === 'italic' ? 'italic' : null;
  }
  if (normalizedProperty === 'text-decoration') return sanitizeTextDecoration(value);

  if (normalizedProperty === 'text-align') {
    return TEXT_ALIGN_STYLE_TAGS.has(tagName)
      ? sanitizeTextAlign(value, element)
      : null;
  }

  if (normalizedProperty === 'list-style-type') {
    return sanitizeListStyleType(value, element);
  }

  if (tagName === 'table') {
    if (normalizedProperty === 'width' || normalizedProperty === 'margin-left') {
      return sanitizePercentStyle(value);
    }
  }

  return null;
}

function sanitizeStyle(element: HTMLElement): string | null {
  const allowed: string[] = [];

  for (const property of Array.from(element.style)) {
    const value = element.style.getPropertyValue(property);
    const sanitized = sanitizeStyleProperty(element, property, value);

    if (sanitized) allowed.push(`${property.toLowerCase()}: ${sanitized}`);
  }

  return allowed.length > 0 ? allowed.join('; ') : null;
}

function sanitizeExplicitUrl(url: string): SanitizedUrl {
  const normalized = normalizeLinkUrl(url);

  if (!normalized.ok) return { ok: false };

  try {
    const parsed = new URL(normalized.url);
    if (!ALLOWED_EXPLICIT_URL_PROTOCOLS.has(parsed.protocol)) return { ok: false };
  } catch {
    return { ok: false };
  }

  return { ok: true, url: normalized.url };
}

function sanitizeRelativeUrl(url: string): SanitizedUrl {
  if (url.startsWith('//') || url.startsWith('\\\\')) return { ok: false };
  if (/[\u0000-\u001F\u007F\s<>"']/.test(url)) return { ok: false };
  if (/[\\]/.test(url)) return { ok: false };

  return { ok: true, url };
}

function sanitizePastedUrl(value: string | null): SanitizedUrl {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return { ok: false };

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return { ok: false };

  const protocolMatch = trimmed.match(/^([a-z][a-z\d+.-]*):/i);
  if (protocolMatch) {
    const protocol = `${protocolMatch[1].toLowerCase()}:`;
    if (!ALLOWED_EXPLICIT_URL_PROTOCOLS.has(protocol)) return { ok: false };

    return sanitizeExplicitUrl(trimmed);
  }

  return sanitizeRelativeUrl(trimmed);
}

function cleanTextAttribute(value: string | null, maxLength: number): string | null {
  const cleaned = value?.replace(/[\u0000-\u001F\u007F<>]/g, '').trim() ?? '';

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function sanitizeIntegerAttribute(
  value: string | null,
  min: number,
  max: number,
): string | null {
  const match = value?.trim().match(/^\d+$/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? String(parsed)
    : null;
}

function sanitizeBooleanAttribute(value: string | null): string | null {
  if (value == null) return null;

  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'true' || normalized === '1'
    ? 'true'
    : normalized === 'false' || normalized === '0'
      ? 'false'
      : null;
}

function sanitizeSafeId(value: string | null): string | null {
  const cleaned = value?.trim() ?? '';

  return /^[a-zA-Z0-9_-]{1,64}$/.test(cleaned) ? cleaned : null;
}

function sanitizeColwidth(value: string | null): string | null {
  if (!value) return null;

  const widths = value
    .split(',')
    .map((width) => width.trim())
    .filter(Boolean);

  if (widths.length === 0 || widths.length > 50) return null;

  const sanitized = widths.map((width) =>
    sanitizeIntegerAttribute(width, 25, 2000),
  );

  return sanitized.every((width): width is string => Boolean(width))
    ? sanitized.join(',')
    : null;
}

function sanitizeListStyleAttribute(
  value: string | null,
  tagName: string,
): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (tagName === 'ol' && ORDERED_LIST_STYLES.has(normalized)) return normalized;
  if (tagName === 'ul' && BULLET_LIST_STYLES.has(normalized)) return normalized;

  return null;
}

function sanitizeOrderedListType(value: string | null): string | null {
  const normalized = value?.trim() ?? '';

  return /^(?:1|a|A|i|I)$/.test(normalized) ? normalized : null;
}

export function isAllowedKbAttribute(
  tagName: string,
  attributeName: string,
): boolean {
  if (tagName === 'aside') {
    return (
      attributeName === 'data-kb-callout' ||
      attributeName === 'data-kb-callout-variant'
    );
  }

  if (tagName === 'div') {
    return DIV_KB_ATTRIBUTE_NAMES.has(attributeName);
  }

  if (tagName === 'section') {
    return SECTION_KB_ATTRIBUTE_NAMES.has(attributeName);
  }

  if (tagName === 'details') {
    return DETAILS_KB_ATTRIBUTE_NAMES.has(attributeName);
  }

  if (tagName === 'h3') return attributeName === 'data-kb-tab-label-static';
  if (tagName === 'summary') {
    return attributeName === 'data-kb-accordion-title-static';
  }

  return false;
}

function collectSafeAttributes(element: HTMLElement): Map<string, string> {
  const tagName = getTagName(element);
  const attributes = new Map<string, string>();

  if (tagName === 'a') {
    const href = sanitizePastedUrl(element.getAttribute('href'));
    if (href.ok) {
      attributes.set('href', href.url);

      if ((element.getAttribute('target') ?? '').trim().toLowerCase() === '_blank') {
        attributes.set('target', '_blank');
        attributes.set('rel', 'noopener noreferrer');
      }
    }

    const title = cleanTextAttribute(element.getAttribute('title'), 300);
    if (title) attributes.set('title', title);
  }

  if (tagName === 'code') {
    const languageClass = Array.from(element.classList).find((className) =>
      /^language-[a-z0-9_+-]{1,40}$/i.test(className),
    );
    if (languageClass) attributes.set('class', languageClass);
  }

  if (tagName === 'ol') {
    const start = sanitizeIntegerAttribute(element.getAttribute('start'), 1, 10000);
    const type = sanitizeOrderedListType(element.getAttribute('type'));
    if (start) attributes.set('start', start);
    if (type) attributes.set('type', type);
  }

  if (tagName === 'ol' || tagName === 'ul') {
    const listStyle = sanitizeListStyleAttribute(
      element.getAttribute('data-list-style'),
      tagName,
    );
    if (listStyle) attributes.set('data-list-style', listStyle);

    if (
      tagName === 'ul' &&
      element.getAttribute('data-type')?.trim() === 'taskList'
    ) {
      attributes.set('data-type', 'taskList');
    }
  }

  if (
    tagName === 'li' &&
    element.getAttribute('data-type')?.trim() === 'taskItem'
  ) {
    attributes.set('data-type', 'taskItem');

    const checked = sanitizeBooleanAttribute(element.getAttribute('data-checked'));
    if (checked) attributes.set('data-checked', checked);
  }

  if (tagName === 'table') {
    const width = readTableWidthPercent(element);
    const offset = readTableOffsetPercent(element);

    if (width != null) attributes.set('data-table-width-pct', String(width));
    if (offset != null) attributes.set('data-table-offset-pct', String(offset));

    TABLE_BORDER_ATTRIBUTES.forEach((attributeName) => {
      const value = sanitizeBooleanAttribute(element.getAttribute(attributeName));
      if (value) attributes.set(attributeName, value);
    });
  }

  if (tagName === 'tr') {
    const rowHeight = sanitizeIntegerAttribute(
      element.getAttribute('data-row-height'),
      20,
      800,
    );
    if (rowHeight) attributes.set('data-row-height', rowHeight);
  }

  if (tagName === 'td' || tagName === 'th') {
    const colspan = sanitizeIntegerAttribute(element.getAttribute('colspan'), 1, 50);
    const rowspan = sanitizeIntegerAttribute(element.getAttribute('rowspan'), 1, 50);
    const colwidth = sanitizeColwidth(element.getAttribute('colwidth'));
    const align = sanitizeTextAlign(
      element.getAttribute('align') ?? element.style.textAlign,
      element,
    );
    const backgroundColor =
      sanitizeCssColor(
        element.ownerDocument,
        element.getAttribute('data-cell-background-color') ??
          element.style.backgroundColor,
      ) ?? null;
    const rowHeight = sanitizeIntegerAttribute(
      element.getAttribute('data-row-height'),
      20,
      800,
    );

    if (colspan && colspan !== '1') attributes.set('colspan', colspan);
    if (rowspan && rowspan !== '1') attributes.set('rowspan', rowspan);
    if (colwidth) attributes.set('colwidth', colwidth);
    if (align) attributes.set('align', align);
    if (backgroundColor) {
      attributes.set('data-cell-background-color', backgroundColor);
    }
    if (rowHeight) attributes.set('data-row-height', rowHeight);
  }

  if (tagName === 'col') {
    const span = sanitizeIntegerAttribute(element.getAttribute('span'), 1, 50);
    const width = sanitizeIntegerAttribute(element.getAttribute('width'), 25, 2000);
    if (span && span !== '1') attributes.set('span', span);
    if (width) attributes.set('width', width);
  }

  if (tagName === 'mark') {
    const color = sanitizeCssColor(
      element.ownerDocument,
      element.getAttribute('data-color') ?? element.style.backgroundColor,
    );
    if (color) attributes.set('data-color', color);
  }

  if (tagName === 'aside' && element.hasAttribute('data-kb-callout')) {
    attributes.set('data-kb-callout', '');
    attributes.set(
      'data-kb-callout-variant',
      normalizeCalloutVariant(element.getAttribute('data-kb-callout-variant')),
    );
  }

  if (tagName === 'div') {
    DIV_KB_ATTRIBUTE_NAMES.forEach((attributeName) => {
      if (element.hasAttribute(attributeName)) attributes.set(attributeName, '');
    });
  }

  if (tagName === 'section' && element.hasAttribute('data-kb-tab-item')) {
    attributes.set('data-kb-tab-item', '');

    const itemId = sanitizeSafeId(element.getAttribute('data-kb-tab-id'));
    const label = cleanTextAttribute(element.getAttribute('data-kb-tab-label'), 120);
    if (itemId) attributes.set('data-kb-tab-id', itemId);
    if (label) attributes.set('data-kb-tab-label', label);
  }

  if (tagName === 'details' && element.hasAttribute('data-kb-accordion-item')) {
    attributes.set('data-kb-accordion-item', '');

    const itemId = sanitizeSafeId(element.getAttribute('data-kb-accordion-id'));
    const title = cleanTextAttribute(
      element.getAttribute('data-kb-accordion-title'),
      120,
    );
    if (itemId) attributes.set('data-kb-accordion-id', itemId);
    if (title) attributes.set('data-kb-accordion-title', title);
    if (element.hasAttribute('open')) attributes.set('open', '');
  }

  if (tagName === 'h3' && element.hasAttribute('data-kb-tab-label-static')) {
    attributes.set('data-kb-tab-label-static', '');
  }

  if (
    tagName === 'summary' &&
    element.hasAttribute('data-kb-accordion-title-static')
  ) {
    attributes.set('data-kb-accordion-title-static', '');
  }

  return attributes;
}

export function applySanitizedAttributes(element: HTMLElement): void {
  const attributes = collectSafeAttributes(element);
  const style = sanitizeStyle(element);

  Array.from(element.attributes).forEach((attribute) => {
    element.removeAttribute(attribute.name);
  });

  attributes.forEach((value, name) => element.setAttribute(name, value));

  if (style) element.setAttribute('style', style);
}
