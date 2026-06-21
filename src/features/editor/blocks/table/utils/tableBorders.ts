export const TABLE_BORDER_ATTRIBUTE_NAMES = {
  top: 'borderTopEnabled',
  right: 'borderRightEnabled',
  bottom: 'borderBottomEnabled',
  left: 'borderLeftEnabled',
  inner: 'borderInnerEnabled',
} as const;

export type TableBorderAttributeName =
  (typeof TABLE_BORDER_ATTRIBUTE_NAMES)[keyof typeof TABLE_BORDER_ATTRIBUTE_NAMES];

export type TableBorderAttributes = Record<TableBorderAttributeName, boolean>;

export const DEFAULT_TABLE_BORDER_ATTRIBUTES: TableBorderAttributes = {
  borderTopEnabled: true,
  borderRightEnabled: true,
  borderBottomEnabled: true,
  borderLeftEnabled: true,
  borderInnerEnabled: true,
};

export function normalizeTableBorderEnabled(value: unknown): boolean {
  return value !== false && value !== 'false';
}

export function readTableBorderAttributes(
  attributes: Record<string, unknown>,
): TableBorderAttributes {
  return {
    borderTopEnabled: normalizeTableBorderEnabled(attributes.borderTopEnabled),
    borderRightEnabled: normalizeTableBorderEnabled(attributes.borderRightEnabled),
    borderBottomEnabled: normalizeTableBorderEnabled(attributes.borderBottomEnabled),
    borderLeftEnabled: normalizeTableBorderEnabled(attributes.borderLeftEnabled),
    borderInnerEnabled: normalizeTableBorderEnabled(attributes.borderInnerEnabled),
  };
}

export function applyTableBorderAttributes(
  table: HTMLTableElement,
  attributes: Record<string, unknown>,
): TableBorderAttributes {
  const borders = readTableBorderAttributes(attributes);

  table.dataset.tableBorderTop = String(borders.borderTopEnabled);
  table.dataset.tableBorderRight = String(borders.borderRightEnabled);
  table.dataset.tableBorderBottom = String(borders.borderBottomEnabled);
  table.dataset.tableBorderLeft = String(borders.borderLeftEnabled);
  table.dataset.tableBorderInner = String(borders.borderInnerEnabled);

  return borders;
}
