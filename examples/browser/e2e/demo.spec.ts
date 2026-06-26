import { expect, test } from '@playwright/test';
import {
  FIXTURE_JPG,
  FIXTURE_PNG,
  expectResultMeta,
  fillProcessForm,
  runProcess,
  uploadFiles,
  waitForPicooReady,
} from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForPicooReady(page);
});

test('initializes WASM worker', async ({ page }) => {
  await expect(page.locator('#status')).toHaveClass(/status--ready/);
  await expect(page.locator('#run')).toBeDisabled();
});

test('processes JPEG resize', async ({ page }) => {
  await uploadFiles(page, [FIXTURE_PNG]);
  await expect(page.locator('#metaOriginal')).toContainText('1 × 1');

  await fillProcessForm(page, { format: 'jpeg', width: '64' });
  await runProcess(page);
  await expectResultMeta(page, { width: 64, height: 64, format: 'jpeg' });
});

test('processes WebP lossy', async ({ page }) => {
  await uploadFiles(page, [FIXTURE_PNG]);
  await fillProcessForm(page, { format: 'webp', width: '64' });
  await runProcess(page);
  await expectResultMeta(page, { width: 64, height: 64, format: 'webp' });
});

test('processes WebP lossless', async ({ page }) => {
  await uploadFiles(page, [FIXTURE_PNG]);
  await fillProcessForm(page, { format: 'webp', width: '64', lossless: true });
  await runProcess(page);
  await expectResultMeta(page, { width: 64, height: 64, format: 'webp' });
});

test('processes PNG with maxSizeKB', async ({ page }) => {
  await uploadFiles(page, [FIXTURE_PNG]);
  await fillProcessForm(page, { format: 'png', width: '128', maxSizeKB: '10' });
  await runProcess(page);
  await expectResultMeta(page, { width: 128, height: 128, format: 'png' });
});

test('batch processes multiple images', async ({ page }) => {
  await uploadFiles(page, [FIXTURE_PNG, FIXTURE_JPG]);
  await expect(page.locator('#batch')).toBeEnabled();

  await fillProcessForm(page, { format: 'jpeg', width: '32' });
  await page.locator('#batch').click();

  await expect(page.locator('#log')).toContainText('batch done: 2 images', { timeout: 60_000 });
  await expect(page.locator('#log')).not.toContainText('error:');
  await expectResultMeta(page, { width: 32, height: 32, format: 'jpeg' });
});
