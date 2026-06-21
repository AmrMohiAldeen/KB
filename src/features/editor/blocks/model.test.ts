import { describe, expect, it } from 'vitest';
import {
  MAX_ITEM_LABEL_LENGTH,
  createAccordionContent,
  createTabItem,
  createTabsContent,
  normalizeItemLabel,
  readContentBlockItemId,
} from './model';

describe('content block model normalization', () => {
  it('uses safe fallbacks for empty, whitespace, and non-string labels', () => {
    expect(normalizeItemLabel('', 'Tab')).toBe('Tab');
    expect(normalizeItemLabel('   ', 'Section')).toBe('Section');
    expect(normalizeItemLabel(null, 'Tab')).toBe('Tab');
    expect(normalizeItemLabel('  Useful label  ', 'Tab')).toBe('Useful label');
  });

  it('bounds pathological labels without constraining ordinary labels', () => {
    expect(normalizeItemLabel('x'.repeat(MAX_ITEM_LABEL_LENGTH + 50), 'Tab')).toHaveLength(
      MAX_ITEM_LABEL_LENGTH,
    );
    expect(normalizeItemLabel('A normal descriptive title', 'Section')).toBe(
      'A normal descriptive title',
    );
  });

  it('falls back for invalid legacy IDs and gives newly created items unique IDs', () => {
    expect(readContentBlockItemId(null, 'fallback')).toBe('fallback');
    expect(readContentBlockItemId('   ', 'fallback')).toBe('fallback');
    expect(readContentBlockItemId(' valid-id ', 'fallback')).toBe('valid-id');

    const items = [
      ...(createTabsContent().content ?? []),
      ...(createAccordionContent().content ?? []),
      createTabItem('Another tab'),
    ];
    const ids = items.map((item) => item.attrs?.itemId);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
