import { expect, test, type Locator, type Page } from '@playwright/test';

async function insertTable(page: Page, rows = 3, cols = 3) {
  await page.getByRole('button', { name: 'Insert Table' }).click();
  await page.getByPlaceholder('Rows').fill(String(rows));
  await page.getByPlaceholder('Cols').fill(String(cols));
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
}

async function tableGeometry(page: Page, table = page.locator('.ProseMirror table').first()) {
  return table.evaluate((tableElement) => {
    const table = tableElement as HTMLTableElement;
    const rect = table.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      storedWidth: Number((table as HTMLTableElement).dataset.tableWidthPct),
      storedOffset: Number((table as HTMLTableElement).dataset.tableOffsetPct),
    };
  });
}

async function resizeOuterTable(
  page: Page,
  deltaWidthFraction: number,
  table = page.locator('.ProseMirror table').first(),
) {
  const initial = await tableGeometry(page, table);
  const y = initial.top + initial.height / 2;

  await page.mouse.move(initial.right - 2, y);
  await page.mouse.down();
  await page.mouse.move(initial.right + initial.width * deltaWidthFraction, y);
  await page.mouse.up();
}

async function documentBlockOrder(editor: Locator) {
  return editor.evaluate((element) =>
    Array.from(element.children)
      .map((child) => {
        if (child.classList.contains('tableWrapper')) return 'table';
        if (child.tagName === 'P') return 'p';
        return null;
      })
      .filter((node) => node != null),
  );
}

async function tableDragHandleCenter(page: Page) {
  const handle = page.getByRole('button', { name: 'Drag table' });
  const rect = await handle.boundingBox();
  if (!rect) throw new Error('Table drag handle is not visible');
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Insert Table' })).toBeVisible();
});

test('toolbar commands support keyboard activation and restore editor focus', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Keyboard formatting');
  await page.keyboard.press('Control+A');

  const boldButton = page.getByRole('button', { name: 'Bold' });
  await boldButton.focus();
  await boldButton.press('Enter');

  await expect(editor.locator('strong')).toHaveText('Keyboard formatting');
  await expect(editor).toBeFocused();
});

test('manual table dimensions are clamped to supported limits', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert Table' }).click();
  await page.getByPlaceholder('Rows').fill('0');
  await page.getByPlaceholder('Cols').fill('999');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();

  await expect(page.locator('.ProseMirror tr')).toHaveCount(1);
  await expect(page.locator('.ProseMirror tr').first().locator('th, td')).toHaveCount(20);
});

test('table toolbar closes cleanly after deleting the active table', async ({ page }) => {
  await insertTable(page, 2, 2);

  const tableToolbar = page.getByRole('toolbar', { name: 'Table controls' });
  await expect(tableToolbar).toBeVisible();
  await page.getByRole('button', { name: 'Delete table row, column, or table' }).click();
  await page.getByRole('menuitem', { name: 'Delete table' }).click();

  await expect(page.locator('.ProseMirror table')).toHaveCount(0);
  await expect(tableToolbar).toBeHidden();
  await expect(page.getByRole('button', { name: 'Insert Table' })).toBeVisible();
});

test('select all highlights the entire table block', async ({ page }) => {
  const editor = page.locator('.ProseMirror');
  await insertTable(page, 2, 2);
  await editor.locator(':scope > p').last().click();
  await page.keyboard.press('Control+A');

  await expect(editor.locator('.tableWrapper')).toHaveClass(/kb-block-selection/);
});

test('toolbar dropdowns render in a portal and support keyboard selection', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Portal heading');

  const styleButton = page.getByRole('button', { name: 'Text size' });
  await styleButton.focus();
  await styleButton.press('Enter');

  const normalTextItem = page.getByRole('menuitem', { name: 'Normal text' });
  await expect(normalTextItem).toBeFocused();
  await normalTextItem.press('ArrowDown');

  const headingItem = page.getByRole('menuitem', { name: 'Heading 1' });
  await expect(headingItem).toBeFocused();
  await expect(headingItem.locator('xpath=ancestor::*[@role="toolbar"]')).toHaveCount(0);
  expect(await headingItem.locator('xpath=ancestor::*[@role="menu"]').evaluate(
    (menu) => getComputedStyle(menu).position,
  )).toBe('fixed');

  await headingItem.press('Enter');

  await expect(editor.locator('h1')).toHaveText('Portal heading');
  await expect(editor).toBeFocused();
});

test('slash menu escapes table clipping, keeps manual scroll, and inserts configured sizes', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await insertTable(page, 1, 1);
  await editor.locator('th, td').first().click();
  await page.keyboard.type('/');

  const menu = page.getByRole('listbox', { name: 'Insert block' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('xpath=ancestor::table')).toHaveCount(0);
  expect(await menu.evaluate((element) => getComputedStyle(element).position)).toBe(
    'fixed',
  );

  await menu.evaluate((element) => {
    element.scrollTop = 60;
    element
      .querySelectorAll<HTMLElement>('[role="option"]')[5]
      ?.dispatchEvent(new MouseEvent('mouseenter'));
  });
  expect(await menu.evaluate((element) => element.scrollTop)).toBe(60);

  await page.keyboard.press('Escape');
  await editor.locator(':scope > p').last().click();
  await page.keyboard.type('/table:4x6');
  await page.keyboard.press('Enter');

  const configuredTable = editor.locator('table').last();
  await expect(configuredTable.locator('tr')).toHaveCount(4);
  await expect(configuredTable.locator('tr').first().locator('th, td')).toHaveCount(6);
});

test('toolbar exposes compact line heights, eraser, list variants, and inline task items', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Formatted');
  await page.keyboard.press('Control+A');
  await page.getByRole('button', { name: 'Bold' }).click();
  await expect(editor.locator('strong')).toHaveText('Formatted');
  await page.getByRole('button', { name: 'Clear formatting' }).click();
  await expect(editor.locator('strong')).toHaveCount(0);

  await page.getByRole('button', { name: 'Line height' }).click();
  await expect(page.getByRole('menuitem', { name: '0.25', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: '0.75', exact: true }).click();
  await expect(editor.locator('[style*="line-height: 0.75"]')).toContainText('Formatted');

  await page.getByRole('button', { name: 'Lists' }).click();
  await page.getByRole('menuitem', { name: 'Square', exact: true }).click();
  await expect(editor.locator('ul[data-list-style="square"]')).toBeVisible();

  await editor.locator(':scope > p').last().click();
  await page.keyboard.type('Task item');
  await page.getByRole('button', { name: 'Lists' }).click();
  await page.getByRole('menuitem', { name: 'Task list', exact: true }).click();
  const taskItem = editor.locator('li.kb-task-item');
  await expect(taskItem).toBeVisible();
  expect(await taskItem.evaluate((item) => getComputedStyle(item).display)).toBe('flex');
});

test('empty table cells retain font defaults and expose a background color control', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await insertTable(page, 1, 1);
  const cell = editor.locator('th, td');
  await cell.click();

  await page.getByRole('button', { name: 'Font family' }).click();
  await page.getByRole('menuitem', { name: 'Georgia', exact: true }).click();
  await expect(cell).toHaveAttribute('data-cell-default-marks', /Georgia/);

  await editor.locator(':scope > p').last().click();
  await cell.click();
  await page.keyboard.type('Inherited');
  await expect(cell.locator('[style*="font-family: Georgia"]')).toHaveText('Inherited');

  await page.getByRole('button', { name: 'Table cell background color' }).click();
  await page.getByRole('menuitem', { name: 'Blue', exact: true }).click();
  await expect(cell).toHaveAttribute('data-cell-background-color', '#bfdbfe');
});

test('link dialog rejects unsafe URLs and normalizes safe hostnames', async ({ page }) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Safe link');
  await page.keyboard.press('Control+A');

  const linkButton = page.getByRole('button', { name: 'Link' });
  await linkButton.focus();
  await linkButton.press('Enter');

  const linkInput = page.getByLabel('Link URL');
  await expect(linkInput).toBeFocused();
  await linkInput.fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('alert')).toContainText('Use HTTP, HTTPS');
  await expect(editor.locator('a')).toHaveCount(0);

  await linkInput.fill('example.com');
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/');
  await expect(editor).toBeFocused();
});

test('outer table resizing is undoable as one history action', async ({ page }) => {
  await insertTable(page);

  const initial = await tableGeometry(page);
  await resizeOuterTable(page, -0.25);

  expect((await tableGeometry(page)).storedWidth).toBeLessThan(90);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => tableGeometry(page).then(({ storedWidth }) => storedWidth)).toBe(100);
  expect((await tableGeometry(page)).width).toBeCloseTo(initial.width, 0);
});

test('outer table resizing works inside tabs and accordions', async ({ page }) => {
  const editor = page.locator('.ProseMirror');

  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();
  await page.locator('.kb-tab-card__body p').first().click();
  await insertTable(page, 2, 2);

  const tabTable = page.locator('.kb-tab-card__body table').first();
  await editor.locator(':scope > p').last().click();
  await resizeOuterTable(page, -0.3, tabTable);
  expect((await tableGeometry(page, tabTable)).storedWidth).toBeLessThan(90);

  await editor.locator(':scope > p').last().click();
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Accordion/ }).click();
  await page.locator('[data-kb-accordion-item]').first().evaluate((item) => {
    (item as HTMLDetailsElement).open = true;
  });
  await page.locator('.kb-accordion__panel p').first().click();
  await insertTable(page, 2, 2);

  const accordionTable = page.locator('.kb-accordion__panel table').first();
  await editor.locator(':scope > p').last().click();
  await resizeOuterTable(page, -0.3, accordionTable);
  expect((await tableGeometry(page, accordionTable)).storedWidth).toBeLessThan(90);
});

test('internal column resizing preserves the stored outer table width', async ({ page }) => {
  await insertTable(page);

  await resizeOuterTable(page, -0.25);

  const narrowed = await tableGeometry(page);
  expect(narrowed.storedWidth).toBeLessThan(90);

  const firstCell = page.locator('.ProseMirror th, .ProseMirror td').first();
  const cellRect = await firstCell.boundingBox();
  if (!cellRect) throw new Error('First table cell is not visible');

  await page.mouse.move(cellRect.x + cellRect.width - 2, cellRect.y + cellRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(cellRect.x + cellRect.width + 40, cellRect.y + cellRect.height / 2);

  const activeColumnResize = await tableGeometry(page);
  expect(activeColumnResize.width).toBeCloseTo(narrowed.width, 0);
  expect(activeColumnResize.storedWidth).toBe(narrowed.storedWidth);

  await page.mouse.up();
});

test('row height moves live during resizing and remains undoable', async ({ page }) => {
  await insertTable(page);

  const firstCell = page.locator('.ProseMirror th, .ProseMirror td').first();
  const firstRow = page.locator('.ProseMirror tr').first();
  const cellRect = await firstCell.boundingBox();
  if (!cellRect) throw new Error('First table cell is not visible');

  const startHeight = await firstRow.evaluate((row) => row.getBoundingClientRect().height);
  await page.mouse.move(cellRect.x + cellRect.width / 2, cellRect.y + cellRect.height - 2);
  await page.mouse.down();
  await page.mouse.move(cellRect.x + cellRect.width / 2, cellRect.y + cellRect.height + 35);

  const liveHeight = await firstRow.evaluate((row) => row.getBoundingClientRect().height);
  expect(liveHeight).toBeGreaterThan(startHeight + 20);

  await page.mouse.up();
  await page.getByRole('button', { name: 'Undo' }).click();

  await expect
    .poll(() => firstRow.evaluate((row) => row.getBoundingClientRect().height))
    .toBeCloseTo(startHeight, 0);
});

test('internal column resizing works inside tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();
  await page.locator('.kb-tab-card__body p').first().click();
  await insertTable(page, 2, 2);

  const firstCell = page.locator('.kb-tab-card__body th, .kb-tab-card__body td').first();
  const startWidth = await firstCell.evaluate((cell) =>
    cell.getBoundingClientRect().width,
  );
  await page.locator('.ProseMirror > p').last().click();
  const cellRect = await firstCell.boundingBox();
  if (!cellRect) throw new Error('Nested first table cell is not visible');

  await page.mouse.move(cellRect.x + cellRect.width - 2, cellRect.y + cellRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(cellRect.x + cellRect.width + 40, cellRect.y + cellRect.height / 2);
  await page.mouse.up();

  await expect
    .poll(() =>
      firstCell.evaluate((cell) => cell.getBoundingClientRect().width),
    )
    .toBeGreaterThan(startWidth + 20);
});

test('row height resizing works inside tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();
  await page.locator('.kb-tab-card__body p').first().click();
  await insertTable(page, 2, 2);

  const firstCell = page.locator('.kb-tab-card__body th, .kb-tab-card__body td').first();
  const firstRow = page.locator('.kb-tab-card__body tr').first();

  const startHeight = await firstRow.evaluate((row) => row.getBoundingClientRect().height);
  await page.locator('.ProseMirror > p').last().click();
  const cellRect = await firstCell.boundingBox();
  if (!cellRect) throw new Error('Nested first table cell is not visible');

  await page.mouse.move(cellRect.x + cellRect.width / 2, cellRect.y + cellRect.height - 2);
  await page.mouse.down();
  await page.mouse.move(cellRect.x + cellRect.width / 2, cellRect.y + cellRect.height + 35);
  await page.mouse.up();

  await expect
    .poll(() => firstRow.evaluate((row) => row.getBoundingClientRect().height))
    .toBeGreaterThan(startHeight + 20);
});

test('internal column resizing works inside accordions', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Accordion/ }).click();
  await page.locator('[data-kb-accordion-item]').first().evaluate((item) => {
    (item as HTMLDetailsElement).open = true;
  });
  await page.locator('.kb-accordion__panel p').first().click();
  await insertTable(page, 2, 2);

  const firstCell = page.locator('.kb-accordion__panel th, .kb-accordion__panel td').first();
  const startWidth = await firstCell.evaluate((cell) =>
    cell.getBoundingClientRect().width,
  );
  await page.locator('.ProseMirror > p').last().click();
  const cellRect = await firstCell.boundingBox();
  if (!cellRect) throw new Error('Nested accordion first table cell is not visible');

  await page.mouse.move(cellRect.x + cellRect.width - 2, cellRect.y + cellRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(cellRect.x + cellRect.width + 40, cellRect.y + cellRect.height / 2);
  await page.mouse.up();

  await expect
    .poll(() =>
      firstCell.evaluate((cell) => cell.getBoundingClientRect().width),
    )
    .toBeGreaterThan(startWidth + 20);
});

test('row height resizing works inside accordions', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Accordion/ }).click();
  await page.locator('[data-kb-accordion-item]').first().evaluate((item) => {
    (item as HTMLDetailsElement).open = true;
  });
  await page.locator('.kb-accordion__panel p').first().click();
  await insertTable(page, 2, 2);

  const firstCell = page.locator('.kb-accordion__panel th, .kb-accordion__panel td').first();
  const firstRow = page.locator('.kb-accordion__panel tr').first();

  const startHeight = await firstRow.evaluate((row) => row.getBoundingClientRect().height);
  await page.locator('.ProseMirror > p').last().click();
  const cellRect = await firstCell.boundingBox();
  if (!cellRect) throw new Error('Nested accordion first table cell is not visible');

  await page.mouse.move(cellRect.x + cellRect.width / 2, cellRect.y + cellRect.height - 2);
  await page.mouse.down();
  await page.mouse.move(cellRect.x + cellRect.width / 2, cellRect.y + cellRect.height + 35);
  await page.mouse.up();

  await expect
    .poll(() => firstRow.evaluate((row) => row.getBoundingClientRect().height))
    .toBeGreaterThan(startHeight + 20);
});

test('table border controls persist individual edge settings in rendered attributes', async ({
  page,
}) => {
  await insertTable(page, 2, 2);

  await page.getByRole('button', { name: 'Customize table borders' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Top border' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Inner border' }).click();

  const table = page.locator('.ProseMirror table');
  await expect(table).toHaveAttribute('data-table-border-top', 'false');
  await expect(table).toHaveAttribute('data-table-border-inner', 'false');
  await expect(table).toHaveAttribute('data-table-border-bottom', 'true');
  expect(
    await table.locator('th, td').first().evaluate((cell) => {
      const style = getComputedStyle(cell);
      return {
        top: style.borderTopColor,
        right: style.borderRightColor,
      };
    }),
  ).toEqual({
    top: 'rgba(0, 0, 0, 0)',
    right: 'rgba(0, 0, 0, 0)',
  });
});

test('drag handle moves the table as a ProseMirror node', async ({ page }) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Paragraph before table');
  await page.keyboard.press('Enter');
  await insertTable(page, 2, 2);

  const paragraph = editor.locator(':scope > p').first();
  const handle = page.getByRole('button', { name: 'Drag table' });
  await expect(handle).toBeVisible();
  const tableRect = await page.locator('.ProseMirror table').boundingBox();
  const handleRect = await handle.boundingBox();
  if (!tableRect || !handleRect) throw new Error('Table drag controls are not visible');
  expect(handleRect.x + handleRect.width).toBeLessThanOrEqual(tableRect.x);
  expect(handleRect.y + handleRect.height).toBeLessThanOrEqual(tableRect.y);

  const paragraphRect = await paragraph.boundingBox();
  if (!paragraphRect) throw new Error('Paragraph drop target is not visible');

  const start = await tableDragHandleCenter(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(paragraphRect.x + 5, paragraphRect.y + 1, { steps: 4 });
  await page.mouse.up();

  const order = await documentBlockOrder(editor);
  expect(order[0]).toBe('table');
  expect(order).toContain('p');

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await documentBlockOrder(editor))[0]).toBe('p');
});

test('a small downward handle drag moves the table by one block', async ({ page }) => {
  const editor = page.locator('.ProseMirror');
  await insertTable(page, 2, 2);

  const start = await tableDragHandleCenter(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 4, start.y + 12, { steps: 2 });
  await page.mouse.up();

  const order = await documentBlockOrder(editor);
  expect(order[0]).toBe('p');
  expect(order[1]).toBe('table');

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await documentBlockOrder(editor))[0]).toBe('table');
});

test('drag handle positions a narrowed table horizontally and remains undoable', async ({
  page,
}) => {
  await insertTable(page, 2, 2);
  await resizeOuterTable(page, -0.4);

  const before = await tableGeometry(page);
  const start = await tableDragHandleCenter(page);
  const targetX = start.x + Math.min(before.width - 10, 220);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(targetX, start.y, { steps: 4 });

  const live = await tableGeometry(page);
  expect(live.left).toBeGreaterThan(before.left + 20);
  await page.mouse.up();

  const persisted = await tableGeometry(page);
  expect(persisted.storedOffset).toBeGreaterThan(5);
  expect(persisted.left).toBeCloseTo(live.left, 0);
  expect(persisted.right).toBeLessThanOrEqual(before.right + before.width * 0.4 + 2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => tableGeometry(page).then(({ storedOffset }) => storedOffset)).toBe(0);
  expect((await tableGeometry(page)).left).toBeCloseTo(before.left, 0);

  const secondStart = await tableDragHandleCenter(page);
  await page.mouse.move(secondStart.x, secondStart.y);
  await page.mouse.down();
  await page.mouse.move(secondStart.x + 120, secondStart.y, { steps: 3 });
  await page.mouse.up();
  expect((await tableGeometry(page)).storedOffset).toBeGreaterThan(5);
});

test('2D table drag commits block movement and horizontal offset as one undo step', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await insertTable(page, 2, 2);
  await resizeOuterTable(page, -0.4);

  const start = await tableDragHandleCenter(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 140, start.y + 16, { steps: 4 });

  await expect(page.locator('.kb-block-drop-indicator')).toBeVisible();
  expect((await tableGeometry(page)).left).toBeGreaterThan(start.x);
  await page.mouse.up();

  expect((await documentBlockOrder(editor))[0]).toBe('p');
  expect((await tableGeometry(page)).storedOffset).toBeGreaterThan(5);

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await documentBlockOrder(editor))[0]).toBe('table');
  await expect.poll(() => tableGeometry(page).then(({ storedOffset }) => storedOffset)).toBe(0);
});

test('Escape cancels table drag previews and removes the drop indicator', async ({
  page,
}) => {
  await insertTable(page, 2, 2);
  await resizeOuterTable(page, -0.4);

  const before = await tableGeometry(page);
  const start = await tableDragHandleCenter(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 16, { steps: 4 });

  await expect(page.locator('.kb-block-drop-indicator')).toBeVisible();
  expect((await tableGeometry(page)).left).toBeGreaterThan(before.left + 20);
  await page.keyboard.press('Escape');

  await expect(page.locator('.kb-block-drop-indicator')).toHaveCount(0);
  expect((await tableGeometry(page)).storedOffset).toBe(before.storedOffset);
  expect((await tableGeometry(page)).left).toBeCloseTo(before.left, 0);
});
