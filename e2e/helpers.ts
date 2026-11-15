import { expect, type Page } from "@playwright/test";

/** Big grids are generated in a worker and can take several seconds. */
export const GENERATE_TIMEOUT = 30_000;

/**
 * Open the app and wait for the first puzzle to be dealt. On a cold server
 * the bank request can time out (2 s) before the worker takes over.
 */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.locator(".cell").first()).toBeVisible({ timeout: GENERATE_TIMEOUT });
}

export async function chooseSize(page: Page, size: number) {
  await page.getByLabel("Grid size").selectOption(String(size));
  await expect(page.locator(".cell")).toHaveCount(size * size, { timeout: GENERATE_TIMEOUT });
  await expect(page.getByText(/^Generating/)).toBeHidden({ timeout: GENERATE_TIMEOUT });
}

/** First empty cell that isn't a given. */
export function emptyCell(page: Page) {
  return page.locator(".cell:not([data-given]):not([data-hinted])").filter({ hasNotText: /./ }).first();
}

export function tool(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}`) });
}

/** Wait for the throttled autosave to land (saves at most every 1.5 s). */
export const waitForSave = (page: Page) => page.waitForTimeout(2000);
