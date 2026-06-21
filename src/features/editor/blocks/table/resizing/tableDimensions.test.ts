import { describe, expect, it } from 'vitest';
import {
  applyTableOffsetPct,
  applyTableWidthPct,
  clampRowHeight,
  clampTableOffsetPct,
  clampTableWidthPct,
  normalizeTableOffsetPct,
  normalizeTableWidthPct,
  readTableOffsetPct,
  readTableWidthPct,
} from './tableDimensions';
import { isNearTableRightEdge } from '../plugins/TableOuterResizePlugin';
import {
  applyRowHeightPreview,
  createRowHeightPreview,
  restoreRowHeightPreview,
} from './rowHeightPreview';

describe('table width dimensions', () => {
  it('normalizes width values into the supported percentage range', () => {
    expect(clampTableWidthPct(5)).toBe(10);
    expect(clampTableWidthPct(74.5)).toBe(74.5);
    expect(clampTableWidthPct(120)).toBe(100);
    expect(clampTableWidthPct(Number.NaN)).toBe(100);
    expect(normalizeTableWidthPct('invalid')).toBe(100);
  });

  it('applies an authoritative percentage width for column resize previews', () => {
    const table = document.createElement('table');

    expect(applyTableWidthPct(table, 72.34)).toBe(72.3);
    expect(table.dataset.tableWidthPct).toBe('72.3');
    expect(table.style.getPropertyValue('--table-width-pct')).toBe('72.3%');
    expect(table.style.width).toBe('72.3%');
    expect(readTableWidthPct(table)).toBe(72.3);
  });

  it('constrains horizontal offsets to the remaining editor width', () => {
    const table = document.createElement('table');

    applyTableWidthPct(table, 70);
    expect(applyTableOffsetPct(table, 18.26, 70)).toBe(18.3);
    expect(readTableOffsetPct(table, 70)).toBe(18.3);
    expect(table.style.getPropertyValue('--table-offset-pct')).toBe('18.3%');

    expect(clampTableOffsetPct(50, 70)).toBe(30);
    expect(clampTableOffsetPct(Number.NaN, 70)).toBe(0);
    expect(normalizeTableOffsetPct('invalid', 70)).toBe(0);
    expect(applyTableWidthPct(table, 90)).toBe(90);
    expect(readTableOffsetPct(table, 90)).toBe(10);
  });

  it('only activates outer resizing along the visible right table edge', () => {
    const table = document.createElement('table');
    table.getBoundingClientRect = () =>
      ({
        top: 20,
        right: 110,
        bottom: 70,
      }) as DOMRect;

    expect(isNearTableRightEdge(table, 106, 40)).toBe(true);
    expect(isNearTableRightEdge(table, 106, 10)).toBe(false);
    expect(isNearTableRightEdge(table, 106, 80)).toBe(false);
    expect(isNearTableRightEdge(table, 90, 40)).toBe(false);
  });
});

describe('row height previews', () => {
  it('updates the row and every cell immediately during a drag', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tableWrapper';
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    const row = document.createElement('tr');
    row.append(document.createElement('td'), document.createElement('td'));
    body.append(row);
    table.append(body);
    wrapper.append(table);
    document.body.append(wrapper);
    const preview = createRowHeightPreview(row);
    expect(preview).not.toBeNull();

    applyRowHeightPreview(preview!, 48);

    expect(wrapper.dataset.rowHeightPreview).toBe(preview?.id);
    expect(preview?.styleElement.textContent).toContain('height: 48px !important');
  });

  it('restores temporary row styles', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tableWrapper';
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    const row = document.createElement('tr');
    row.append(document.createElement('td'));
    body.append(row);
    table.append(body);
    wrapper.append(table);
    document.body.append(wrapper);
    const preview = createRowHeightPreview(row);
    expect(preview).not.toBeNull();

    applyRowHeightPreview(preview!, 60);
    restoreRowHeightPreview(preview!);
    expect(preview?.styleElement.isConnected).toBe(false);
    expect(wrapper.dataset.rowHeightPreview).toBeUndefined();
    expect(clampRowHeight(2)).toBe(20);
  });
});
