import { expect, test, type Locator, type Page } from '@playwright/test';

async function insertTable(page: Page, rows = 2, cols = 2) {
  await page.getByRole('button', { name: 'Insert Table' }).click();
  await page.getByPlaceholder('Rows').fill(String(rows));
  await page.getByPlaceholder('Cols').fill(String(cols));
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
}

async function insertImage(page: Page) {
  const imageUrl = new URL('/favicon.ico', page.url()).href;

  await page.getByRole('button', { name: 'Insert image' }).click();
  await page.getByLabel('Image URL').fill(imageUrl);
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
}

async function topLevelBlockOrder(page: Page) {
  return page.locator('.ProseMirror').evaluate((editor) =>
    Array.from(editor.children).map((child) => {
      if ((child as HTMLElement).dataset.kbTabs != null) return 'tabs';
      if ((child as HTMLElement).dataset.kbAccordion != null) return 'accordion';
      return child.tagName.toLowerCase();
    }),
  );
}

async function tabBodyParagraphs(page: Page) {
  return page.locator('.kb-tab-card__body').first().locator(':scope > p');
}

async function tabBodyParagraphTexts(page: Page) {
  return page.locator('.kb-tab-card__body').first().evaluate((body) =>
    Array.from(body.querySelectorAll(':scope > p')).map((paragraph) =>
      paragraph.textContent?.trim() ?? '',
    ),
  );
}

async function dragHandleTo(
  page: Page,
  handle: Locator,
  target: Locator,
  targetPosition: { x: number; y: number },
) {
  const handleRect = await handle.boundingBox();
  const targetRect = await target.boundingBox();
  if (!handleRect || !targetRect) {
    throw new Error('Drag handle or target is not visible');
  }

  await page.evaluate(
    ({ startX, startY, targetX, targetY }) => {
      const handleElement = document.querySelector<HTMLElement>(
        '.kb-official-drag-handle',
      );
      if (!handleElement) throw new Error('Drag handle element not found');

      const dataTransfer = new DataTransfer();
      const dragStart = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY,
        dataTransfer,
      });
      handleElement.dispatchEvent(dragStart);

      const dragOver = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: targetX,
        clientY: targetY,
        dataTransfer,
      });
      document.dispatchEvent(dragOver);

      const drop = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: targetX,
        clientY: targetY,
        dataTransfer,
      });
      document.dispatchEvent(drop);

      const dragEnd = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        clientX: targetX,
        clientY: targetY,
        dataTransfer,
      });
      handleElement.dispatchEvent(dragEnd);
    },
    {
      startX: handleRect.x + handleRect.width / 2,
      startY: handleRect.y + handleRect.height / 2,
      targetX: targetRect.x + targetPosition.x,
      targetY: targetRect.y + targetPosition.y,
    },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Insert content block' })).toBeVisible();
});

test('tabs and accordions support toolbar/slash insertion and nested editing', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');

  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();

  await expect(page.locator('.kb-tab-card')).toHaveCount(2);
  const firstTabLabel = page.locator('.kb-tab-card__title-input').first();
  await firstTabLabel.fill('Overview');
  await firstTabLabel.press('Enter');
  await expect(firstTabLabel).toHaveValue('Overview');

  await expect(page.getByRole('menuitem', { name: 'Move tab down' })).toBeHidden();
  await page.getByRole('button', { name: 'Tab actions for Overview' }).click();
  await expect(page.getByRole('menuitem', { name: 'Move tab down' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Add tab' }).click();
  await expect(page.locator('.kb-tab-card__title-input')).toHaveCount(3);

  const firstTabBody = page.locator('.kb-tab-card__body').first();
  await page.getByRole('button', { name: 'Collapse tab body' }).first().click();
  await expect(firstTabBody).toBeHidden();
  await page.getByRole('button', { name: 'Expand tab body' }).first().click();
  await expect(firstTabBody).toBeVisible();
  await firstTabBody.locator('p').click();
  await page.keyboard.type('Nested tab content');
  await expect(firstTabBody).toContainText('Nested tab content');

  await editor.locator(':scope > p').last().click();
  await page.keyboard.type('/acc');
  await expect(page.getByRole('option', { name: /Accordion/ })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.locator('.kb-accordion__chevron')).toHaveCount(2);
  const firstAccordionTitle = page.locator('.kb-accordion__title-input').first();
  await firstAccordionTitle.fill('FAQ');
  await firstAccordionTitle.press('Enter');
  await expect(firstAccordionTitle).toHaveValue('FAQ');

  await expect(
    page.getByRole('menuitem', { name: 'Move accordion item down' }).first(),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Accordion actions for FAQ' }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Move accordion item down' }).first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Add accordion item' }).click();
  await expect(page.locator('[data-kb-accordion-item]')).toHaveCount(3);
});

test('callouts support slash insertion, nested editing, and variant changes', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('/warning');
  await expect(
    page.getByRole('option', { name: /Warning callout/ }),
  ).toBeVisible();
  await page.keyboard.press('Enter');

  const callout = page.locator('[data-kb-callout]').first();
  await expect(callout).toHaveAttribute('data-kb-callout-variant', 'warning');
  await callout.locator('[data-kb-callout-content] p').click();
  await page.keyboard.type('Nested callout content');
  await expect(callout).toContainText('Nested callout content');

  await page.getByRole('button', { name: 'Callout variant' }).click();
  await page.getByRole('menuitem', { name: 'Success' }).click();
  await expect(callout).toHaveAttribute('data-kb-callout-variant', 'success');
});

test('blocks picker opens callouts as a floating hover submenu', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  const callouts = page.getByRole('menuitem', { name: /^Callouts/ });
  await callouts.hover();

  const warning = page.getByRole('menuitem', { name: /Warning callout/ });
  await expect(warning).toBeVisible();
  await expect(warning.locator('xpath=ancestor::*[@role="toolbar"]')).toHaveCount(0);
  await warning.click();

  await expect(page.locator('[data-kb-callout]')).toHaveAttribute(
    'data-kb-callout-variant',
    'warning',
  );
});

test('content blocks highlight on selection and move with the shared drag handle', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Paragraph before content block');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();

  const tabs = page.locator('[data-kb-tabs]');
  await tabs.locator('.kb-tab-card__title-input').first().click();
  const handle = page.getByRole('button', { name: 'Drag content block' });
  await expect(handle).toBeVisible();
  await handle.click();
  await expect(tabs).toHaveClass(/kb-block-selection/);

  const paragraph = editor.locator(':scope > p').first();
  await handle.dragTo(paragraph, {
    targetPosition: { x: 5, y: 1 },
  });

  await expect(editor.locator(':scope > [data-kb-tabs]').first()).toBeVisible();
  await expect(editor.locator(':scope > [data-kb-tabs] + p').first()).toContainText(
    'Paragraph before content block',
  );

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(editor.locator(':scope > p').first()).toContainText(
    'Paragraph before content block',
  );
});

test('tables and images inside tabs get their own drag handles', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();

  const firstTabBody = page.locator('.kb-tab-card__body').first();
  await firstTabBody.locator(':scope > p').first().click();
  await insertTable(page, 2, 2);

  await firstTabBody.locator('th, td').first().click();
  await expect(page.getByRole('button', { name: 'Drag table' })).toBeVisible();

  const secondTabBody = page.locator('.kb-tab-card__body').nth(1);
  await secondTabBody.locator(':scope > p').first().click();
  await insertImage(page);

  const image = secondTabBody.locator('img[data-kb-image="block"]').first();
  await expect(image).toBeVisible();
  await image.click();
  await expect(page.getByRole('button', { name: 'Drag image' })).toBeVisible();
});

test('tables and images inside accordions get their own drag handles', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Accordion/ }).click();

  const firstItem = page.locator('[data-kb-accordion-item]').first();
  await firstItem.evaluate((item) => {
    (item as HTMLDetailsElement).open = true;
  });
  const firstPanel = firstItem.locator('.kb-accordion__panel');

  await firstPanel.locator(':scope > p').first().click();
  await insertTable(page, 2, 2);

  await firstPanel.locator('th, td').first().click();
  await expect(page.getByRole('button', { name: 'Drag table' })).toBeVisible();

  const secondItem = page.locator('[data-kb-accordion-item]').nth(1);
  await secondItem.evaluate((item) => {
    (item as HTMLDetailsElement).open = true;
  });
  const secondPanel = secondItem.locator('.kb-accordion__panel');
  await secondPanel.locator(':scope > p').first().click();
  await insertImage(page);

  const image = secondPanel.locator('img[data-kb-image="block"]').first();
  await expect(image).toBeVisible();
  await image.click();
  await expect(page.getByRole('button', { name: 'Drag image' })).toBeVisible();
});

test('block reorder works inside a tab', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();

  const paragraphs = await tabBodyParagraphs(page);
  await paragraphs.first().click();
  await page.keyboard.type('First nested paragraph');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second nested paragraph');

  await paragraphs.nth(1).click();
  const handle = page.getByRole('button', { name: 'Drag block' });
  await expect(handle).toBeVisible();
  await dragHandleTo(page, handle, paragraphs.first(), { x: 5, y: 1 });

  expect(await tabBodyParagraphTexts(page)).toEqual([
    'Second nested paragraph',
    'First nested paragraph',
  ]);
});

test('nested dragging does not move the outer tabs block by mistake', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type('Paragraph before tabs');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();

  const paragraphs = await tabBodyParagraphs(page);
  await paragraphs.first().click();
  await page.keyboard.type('Nested first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Nested second');

  await paragraphs.nth(1).click();
  const handle = page.getByRole('button', { name: 'Drag block' });
  await expect(handle).toBeVisible();
  await dragHandleTo(page, handle, editor.locator(':scope > p').first(), {
    x: 5,
    y: 1,
  });

  const order = await topLevelBlockOrder(page);
  expect(order[0]).toBe('p');
  expect(order.indexOf('tabs')).toBeGreaterThan(0);
  expect(await tabBodyParagraphTexts(page)).toEqual([
    'Nested second',
    'Nested first',
  ]);
});

test('select all highlights tabs and accordions', async ({ page }) => {
  const editor = page.locator('.ProseMirror');

  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();
  await editor.locator(':scope > p').last().click();
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Accordion/ }).click();

  await editor.locator(':scope > p').last().click();
  await page.keyboard.press('Control+A');

  await expect(page.locator('[data-kb-tabs]')).toHaveClass(/kb-block-selection/);
  await expect(page.locator('[data-kb-accordion]')).toHaveClass(
    /kb-block-selection/,
  );
});

test('content block controls take focus from an active table and preserve undo', async ({
  page,
}) => {
  const editor = page.locator('.ProseMirror');

  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();
  await editor.locator(':scope > p').last().click();
  await insertTable(page);

  const tableToolbar = page.getByRole('toolbar', { name: 'Table controls' });
  const firstTableCell = editor.locator('th, td').first();
  const labels = page.locator('.kb-tab-card__title-input');

  await expect(tableToolbar).toBeVisible();
  await labels.first().click();
  await expect(tableToolbar).toBeHidden();
  await expect(page.locator('[data-kb-tabs]')).toHaveClass(/kb-block-selection/);
  await labels.first().fill('Overview');
  await labels.first().press('Enter');
  await expect(labels.first()).toHaveValue('Overview');
  await page.keyboard.press('Control+Z');
  await expect(labels.first()).toHaveValue('Tab 1');

  await firstTableCell.click();
  await expect(tableToolbar).toBeVisible();
  await page.getByRole('button', { name: 'Tab actions for Tab 1' }).click();
  await page.getByRole('menuitem', { name: 'Move tab down' }).click();

  await expect(tableToolbar).toBeHidden();
  await expect(labels.first()).toHaveValue('Tab 2');
  await page.keyboard.press('Control+Z');
  await expect(labels.first()).toHaveValue('Tab 1');

  await firstTableCell.click();
  await expect(tableToolbar).toBeVisible();
  await page.getByRole('button', { name: 'Tab actions for Tab 1' }).click();
  await page.getByRole('menuitem', { name: 'Remove tab' }).click();

  await expect(tableToolbar).toBeHidden();
  await expect(labels).toHaveCount(1);
  await page.keyboard.press('Control+Z');
  await expect(labels).toHaveCount(2);
});
