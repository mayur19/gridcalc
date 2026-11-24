import { expect, test } from '@playwright/test';

test.skip(!!process.env.CI, 'Browsers are not installed in CI yet (GC-105)');

test('owner signs in, edits a cell and sees dependents recalculate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@gridcalc.test');
  await page.getByLabel('Password').fill('gridcalc-demo-pass');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Workbooks' })).toBeVisible();
  await page.getByRole('link', { name: 'Quarterly budget FY26' }).click();

  const total = page.locator('[data-cell="F2"]');
  await expect(total).not.toHaveText('');
  const before = await total.textContent();

  await page.locator('[data-cell="B2"]').click();
  await page.keyboard.type('999999');
  await page.keyboard.press('Enter');

  await expect(total).not.toHaveText(before ?? '');
  await expect(page.getByRole('status').last()).toContainText('recalculated');
});

test('planned sections show their badge', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('viewer@gridcalc.test');
  await page.getByLabel('Password').fill('gridcalc-demo-pass');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: /Pivot tables/ }).click();
  await expect(page.getByText('GC-077')).toBeVisible();
});
