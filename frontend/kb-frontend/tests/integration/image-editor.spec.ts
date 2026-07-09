import { expect, test, type Locator, type Page } from '@playwright/test';

async function insertImage(page: Page) {
  const imageUrl = new URL('/favicon.ico', page.url()).href;

  await page.getByRole('button', { name: 'Insert image' }).click();
  await page.getByLabel('Image URL').fill(imageUrl);
  await page.getByRole('button', { name: 'Insert', exact: true }).click();

  const image = page.locator('.ProseMirror img[data-kb-image="block"]').first();
  await expect(image).toBeVisible();
  return image;
}

async function dragImageResizeHandle(page: Page, deltaX: number) {
  const resizeHandle = page.getByRole('button', { name: 'Resize image' });
  await expect(resizeHandle).toBeVisible();

  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error('Nested image resize handle is not visible');

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 4 });
  await page.mouse.up();
}

async function imageRenderedWidth(image: Locator) {
  return image.evaluate((element) =>
    Number(element.getAttribute('width') ?? element.getBoundingClientRect().width),
  );
}

async function expectImageCanResizeBothDirections(page: Page) {
  const image = await insertImage(page);

  await image.click();

  const beforeWidth = await imageRenderedWidth(image);

  await dragImageResizeHandle(page, -80);

  await expect.poll(() => imageRenderedWidth(image)).toBeLessThan(beforeWidth - 40);

  const shrunkWidth = await imageRenderedWidth(image);

  await dragImageResizeHandle(page, 60);

  await expect.poll(() => imageRenderedWidth(image)).toBeGreaterThan(shrunkWidth + 40);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Insert image' })).toBeVisible();
});

test('clicking an inserted image exposes resize controls and persists width', async ({
  page,
}) => {
  const image = await insertImage(page);

  await image.click();

  const resizeHandle = page.getByRole('button', { name: 'Resize image' });
  await expect(resizeHandle).toBeVisible();

  const before = await image.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      storedWidth: Number(element.getAttribute('width') ?? 0),
    };
  });
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error('Image resize handle is not visible');

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY, { steps: 4 });
  await page.mouse.up();

  await expect
    .poll(() =>
      image.evaluate((element) => Number(element.getAttribute('width') ?? 0)),
    )
    .toBeGreaterThan(Math.max(before.storedWidth, before.width) + 40);
});

test('image resizing works inside tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Tabs/ }).click();
  await page.locator('.kb-tab-card__body p').first().click();

  await expectImageCanResizeBothDirections(page);
});

test('image resizing works inside accordions', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert content block' }).click();
  await page.getByRole('menuitem', { name: /Accordion/ }).click();
  await page.locator('[data-kb-accordion-item]').first().evaluate((item) => {
    (item as HTMLDetailsElement).open = true;
  });
  await page.locator('.kb-accordion__panel p').first().click();

  await expectImageCanResizeBothDirections(page);
});
