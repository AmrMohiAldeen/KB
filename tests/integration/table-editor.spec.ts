import { expect, test, type Locator, type Page } from '@playwright/test';

async function insertTable(page: Page, rows = 3, cols = 3) {
  await page.getByRole('button', { name: 'Insert Table' }).click();
  await page.getByPlaceholder('Rows').fill(String(rows));
  await page.getByPlaceholder('Cols').fill(String(cols));
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
}

async function tableGeometry(page: Page) {
  return page.locator('.ProseMirror table').evaluate((table) => {
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

async function resizeOuterTable(page: Page, deltaWidthFraction: number) {
  const initial = await tableGeometry(page);
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

  await handle.dragTo(paragraph, {
    targetPosition: { x: 5, y: 1 },
  });

  const order = await documentBlockOrder(editor);
  expect(order[0]).toBe('table');
  expect(order).toContain('p');

  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await documentBlockOrder(editor))[0]).toBe('p');
});

test('a small downward handle drag moves the table by one block', async ({ page }) => {
  const editor = page.locator('.ProseMirror');
  await insertTable(page, 2, 2);

  const handle = page.getByRole('button', { name: 'Drag table' });
  const handleRect = await handle.boundingBox();
  if (!handleRect) throw new Error('Table drag handle is not visible');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const startX = handleRect.x + handleRect.width / 2;
  const startY = handleRect.y + handleRect.height / 2;

  await handle.dispatchEvent('dragstart', { dataTransfer, clientX: startX, clientY: startY });
  await handle.dispatchEvent('dragover', {
    dataTransfer,
    clientX: startX + 20,
    clientY: startY + 8,
  });
  await handle.dispatchEvent('drop', {
    dataTransfer,
    clientX: startX + 20,
    clientY: startY + 8,
  });
  await dataTransfer.dispose();

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
  const table = page.locator('.ProseMirror table');
  const handle = page.getByRole('button', { name: 'Drag table' });
  const handleRect = await handle.boundingBox();
  if (!handleRect) throw new Error('Table drag handle is not visible');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const startX = handleRect.x + handleRect.width / 2;
  const startY = handleRect.y + handleRect.height / 2;
  const targetX = startX + Math.min(before.width - 10, 220);

  await handle.dispatchEvent('dragstart', { dataTransfer, clientX: startX, clientY: startY });
  await table.dispatchEvent('dragover', {
    dataTransfer,
    clientX: targetX,
    clientY: startY,
  });

  const live = await tableGeometry(page);
  expect(live.left).toBeGreaterThan(before.left + 20);
  await table.dispatchEvent('drop', { dataTransfer, clientX: targetX, clientY: startY });
  await dataTransfer.dispose();

  const persisted = await tableGeometry(page);
  expect(persisted.storedOffset).toBeGreaterThan(5);
  expect(persisted.left).toBeCloseTo(live.left, 0);
  expect(persisted.right).toBeLessThanOrEqual(before.right + before.width * 0.4 + 2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => tableGeometry(page).then(({ storedOffset }) => storedOffset)).toBe(0);
  expect((await tableGeometry(page)).left).toBeCloseTo(before.left, 0);

  const editor = page.locator('.ProseMirror');
  const editorRect = await editor.boundingBox();
  if (!editorRect) throw new Error('Editor is not visible');

  await handle.dragTo(editor, {
    targetPosition: {
      x: targetX - editorRect.x,
      y: startY - editorRect.y,
    },
  });
  expect((await tableGeometry(page)).storedOffset).toBeGreaterThan(5);
});
