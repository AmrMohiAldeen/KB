import { describe, expect, it } from 'vitest';
import {
  applyTableBorderAttributes,
  DEFAULT_TABLE_BORDER_ATTRIBUTES,
  readTableBorderAttributes,
} from './tableBorders';

describe('table border attributes', () => {
  it('defaults missing attributes to enabled for existing tables', () => {
    expect(readTableBorderAttributes({})).toEqual(DEFAULT_TABLE_BORDER_ATTRIBUTES);
  });

  it('applies persistent data attributes to rendered tables', () => {
    const table = document.createElement('table');

    applyTableBorderAttributes(table, {
      borderTopEnabled: false,
      borderRightEnabled: true,
      borderBottomEnabled: false,
      borderLeftEnabled: true,
      borderInnerEnabled: false,
    });

    expect(table.dataset.tableBorderTop).toBe('false');
    expect(table.dataset.tableBorderRight).toBe('true');
    expect(table.dataset.tableBorderBottom).toBe('false');
    expect(table.dataset.tableBorderLeft).toBe('true');
    expect(table.dataset.tableBorderInner).toBe('false');
  });
});
