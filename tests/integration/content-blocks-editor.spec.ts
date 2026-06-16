import { expect, test, type Page } from '@playwright/test';

async function insertTable(page: Page, rows = 2, cols = 2) {
  await page.getByRole('button', { name: 'Insert Table' }).click();
  await page.getByPlaceholder('Rows').fill(String(rows));
  await page.getByPlaceholder('Cols').fill(String(cols));
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
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
  await tabs.locator('.kb-tab-card__body p').first().click();
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
