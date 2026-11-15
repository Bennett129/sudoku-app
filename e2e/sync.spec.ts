import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { emptyCell, openApp, waitForSave } from "./helpers";

/**
 * Two "devices" (separate browser contexts, each with its own IndexedDB and
 * localStorage) signed in to the same test account. Needs the database.
 * No email is sent: the sign-in code comes from a server-side helper that
 * only works for @sync.e2e.test addresses.
 */
test.describe("account sync", () => {
  test.skip(({ isMobile }) => isMobile, "covered on desktop; the phone layout doesn't change sync");
  test.skip(!process.env.DATABASE_URL && !existsSync(".env"), "needs a database");

  test("games and settings follow the player to another device and back", async ({ browser }) => {
    test.setTimeout(90_000);
    const email = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@sync.e2e.test`;

    // Device A plays a little and changes the theme before signing in.
    const a = await browser.newContext();
    const pageA = await a.newPage();
    await openApp(pageA);
    await pageA.getByRole("radio", { name: /^Dusk theme/ }).first().click();
    const cellA = emptyCell(pageA);
    const index = (await cellA.getAttribute("data-cell"))!;
    await cellA.click();
    await pageA.getByRole("button", { name: /^3\s*\d*$/ }).first().click();
    await waitForSave(pageA);

    // Signing in uploads what was played so far.
    await signIn(pageA, email);
    await expectSynced(pageA);

    // Device B: same account, empty storage. It deals its own puzzle first,
    // then switches to the game in progress once the account answers.
    const b = await browser.newContext();
    await b.addCookies((await a.storageState()).cookies);
    const pageB = await b.newPage();
    await openApp(pageB);
    const target = (page: Page, i: string) => page.locator(`.cell[data-cell="${i}"]`);
    await expect(target(pageB, index)).toHaveText("3", { timeout: 20_000 });
    await expect(pageB.locator("html")).toHaveAttribute("data-theme", "dusk");

    // B carries on; A picks it up on its next visit.
    const cellB = emptyCell(pageB);
    const indexB = (await cellB.getAttribute("data-cell"))!;
    await cellB.click();
    await pageB.getByRole("button", { name: /^5\s*\d*$/ }).first().click();
    await waitForSave(pageB);
    await expectSynced(pageB, true);

    await pageA.reload();
    await expect(target(pageA, indexB)).toHaveText("5", { timeout: 20_000 });
    await expect(target(pageA, index)).toHaveText("3");

    await a.close();
    await b.close();
  });
});

async function signIn(page: Page, email: string) {
  const otp = execFileSync(process.execPath, ["--import", "tsx", "scripts/e2e-sign-in-code.ts", email], {
    encoding: "utf8",
  }).trim();
  expect(otp).toMatch(/^\d{6}$/);
  const status = await page.evaluate(
    async ({ email, otp }) =>
      (
        await fetch("/api/auth/sign-in/email-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        })
      ).status,
    { email, otp },
  );
  expect(status).toBe(200);
  await page.reload();
  await expect(page.locator(".cell").first()).toBeVisible();
}

/** Open the account dialog and wait for a completed sync. */
async function expectSynced(page: Page, syncNow = false) {
  await page.getByRole("button", { name: /^Account/ }).click();
  const dialog = page.getByRole("dialog", { name: "Account" });
  if (syncNow) await dialog.getByRole("button", { name: "Sync now" }).click();
  await expect(dialog.getByRole("status")).toHaveText(/Last synced/, { timeout: 20_000 });
  await dialog.getByRole("button", { name: "Close" }).click();
}
