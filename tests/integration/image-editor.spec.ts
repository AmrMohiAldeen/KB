import { expect, test, type Page } from '@playwright/test';

async function insertImage(page: Page) {
  const imageUrl = new URL('/favicon.ico', page.url()).href;

  await page.getByRole('button', { name: 'Insert image' }).click();
  await page.getByLabel('Image URL').fill(imageUrl);
  await page.getByRole('button', { name: 'Insert', exact: true }).click();

  const image = page.locator('.ProseMirror img[data-kb-image="block"]').first();
  await expect(image).toBeVisible();
  return image;
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
