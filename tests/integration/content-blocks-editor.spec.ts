import { expect, test } from '@playwright/test';

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
