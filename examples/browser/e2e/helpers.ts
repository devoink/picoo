import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_PNG = path.resolve(e2eDir, '../../../tests/fixtures/1x1.png');
export const FIXTURE_JPG = path.resolve(e2eDir, '../../../tests/fixtures/1x1.jpg');

export async function waitForPicooReady(page: Page) {
  await expect(page.locator('#status')).toHaveText('picoo ready', { timeout: 30_000 });
}

export async function uploadFiles(page: Page, files: string[]) {
  await page.locator('#file').setInputFiles(files);
  await expect(page.locator('#previewOriginal')).toBeVisible();
}

export interface ProcessFormOptions {
  format?: 'jpeg' | 'png' | 'webp';
  maxSizeKB?: string;
  lossless?: boolean;
  width?: string;
}

export async function fillProcessForm(page: Page, options: ProcessFormOptions = {}) {
  if (options.width !== undefined) {
    await page.locator('#width').fill(options.width);
  }
  if (options.format) {
    await page.locator('#format').selectOption(options.format);
  }
  if (options.maxSizeKB !== undefined) {
    await page.locator('#maxSizeKB').fill(options.maxSizeKB);
  }
  if (options.lossless) {
    await page.locator('#lossless').check();
  }
}

export async function runProcess(page: Page) {
  await page.locator('#run').click();
  await expect(page.locator('#log')).toContainText(/done \d+×\d+/, { timeout: 30_000 });
  await expect(page.locator('#log')).not.toContainText('error:');
  await expect(page.locator('#previewResult')).toBeVisible();
  await expect(page.locator('#download')).toBeVisible();
}

export async function expectResultMeta(
  page: Page,
  expected: { width: number; height: number; format: string },
) {
  const meta = page.locator('#metaResult');
  await expect(meta).toContainText(`${expected.width} × ${expected.height}`);
  await expect(meta).toContainText(expected.format.toUpperCase());
}
