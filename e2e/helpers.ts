import { expect, type Page } from "@playwright/test";

/** Open the app and wait for the first puzzle to be dealt. */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.locator(".cell").first()).toBeVisible();
}

export async function chooseSize(page: Page, size: number) {
  await page.getByLabel("Grid size").selectOption(String(size));
  await expect(page.locator(".cell")).toHaveCount(size * size);
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
