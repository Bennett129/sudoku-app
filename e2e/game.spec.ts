import { expect, test } from "@playwright/test";
import { chooseSize, emptyCell, GENERATE_TIMEOUT, openApp, tool, waitForSave } from "./helpers";

test.describe("board", () => {
  test("deals a 9×9 puzzle by default with gridlines", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".cell")).toHaveCount(81);
    await expect(page.locator(".gridlines-thin")).toBeAttached();
    await expect(page.locator(".gridlines-thick")).toBeAttached();
  });

  test("every offered size renders and 4×4 is gone", async ({ page }) => {
    await openApp(page);
    const options = await page.getByLabel("Grid size").locator("option").evaluateAll((o) =>
      o.map((x) => (x as HTMLOptionElement).value),
    );
    expect(options).toEqual(["6", "8", "9", "10", "12", "15", "16", "20", "25"]);
    for (const size of [6, 16, 25]) await chooseSize(page, size);
  });

  test("number pad enters values and the mistake marking follows settings", async ({ page }) => {
    await openApp(page);
    const cell = emptyCell(page);
    const index = await cell.getAttribute("data-cell");
    await cell.click();
    await page.getByRole("button", { name: /^1\s*\d*$/ }).first().click();
    const target = page.locator(`.cell[data-cell="${index}"]`);
    await expect(target).toHaveText("1");
  });

  test("fill notes pencils in candidates and undo removes them", async ({ page }) => {
    await openApp(page);
    // Count before filling: once notes exist, a cell with one candidate has text too.
    const empty = await page.locator(".cell").filter({ hasNotText: /./ }).count();
    await tool(page, "Fill notes").click();
    await expect(page.locator(".cell .notes")).toHaveCount(empty);
    await tool(page, "Undo").click();
    await expect(page.locator(".cell .notes")).toHaveCount(0);
  });

  test("big grids show note dots until zoomed in", async ({ page }) => {
    await openApp(page);
    await chooseSize(page, 25);
    await tool(page, "Fill notes").click();
    await expect(page.locator(".note-dot").first()).toBeVisible();
    await expect(page.locator(".notes")).toHaveCount(0);
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator(".notes").first()).toBeAttached();
    await expect(page.locator(".note-dot")).toHaveCount(0);
  });

  test("double-click zooms into a box and back out", async ({ page, isMobile }) => {
    test.skip(isMobile, "double-tap is exercised through the same handler as double-click");
    await openApp(page);
    const fit = page.getByRole("button", { name: "Fit board" });
    await expect(fit).toHaveText("100%");
    await page.locator(".cell").nth(40).dblclick();
    await expect(fit).not.toHaveText("100%");
    await page.locator(".cell").nth(40).dblclick();
    await expect(fit).toHaveText("100%");
  });
});

test.describe("difficulty", () => {
  test("choosing a difficulty deals a puzzle graded at that level", async ({ page }) => {
    await openApp(page);
    const chip = page.getByTitle("This puzzle's graded difficulty");
    await expect(chip).toHaveText("Medium"); // the default
    await page.getByLabel("Difficulty for new puzzles").selectOption("easy");
    await expect(chip).toHaveText("Easy", { timeout: GENERATE_TIMEOUT });
    // Expert lands within milliseconds on 9×9; Hard is rarer and is covered by
    // a seeded unit test instead, so this test can't flake on a slow runner.
    await page.getByLabel("Difficulty for new puzzles").selectOption("expert");
    await expect(chip).toHaveText("Expert", { timeout: GENERATE_TIMEOUT });
  });

  test("6×6 only offers easy and medium", async ({ page }) => {
    await openApp(page);
    await page.getByLabel("Grid size").selectOption("6");
    const options = await page.getByLabel("Difficulty for new puzzles").locator("option").allTextContents();
    expect(options).toEqual(["Easy", "Medium"]);
  });
});

test.describe("keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "keyboard input is a desktop feature");

  test("digits enter values, Shift adds notes, Ctrl+Z undoes", async ({ page }) => {
    await openApp(page);
    const cell = emptyCell(page);
    const index = await cell.getAttribute("data-cell");
    const target = page.locator(`.cell[data-cell="${index}"]`);
    await cell.click();
    await page.keyboard.press("Shift+Digit2");
    await page.keyboard.press("Shift+Digit7");
    await expect(target.locator(".notes")).toHaveText("27");
    await page.keyboard.press("Digit5");
    await expect(target).toHaveText("5");
    await page.keyboard.press("Control+KeyZ");
    await expect(target.locator(".notes")).toHaveText("27");
  });
});

test.describe("saving", () => {
  test("progress survives a reload", async ({ page }) => {
    await openApp(page);
    const cell = emptyCell(page);
    const index = await cell.getAttribute("data-cell");
    await cell.click();
    await page.getByRole("button", { name: /^3\s*\d*$/ }).first().click();
    await waitForSave(page);
    await page.reload();
    await expect(page.locator(`.cell[data-cell="${index}"]`)).toHaveText("3");
  });

  test("each size keeps its own game", async ({ page }) => {
    await openApp(page);
    const givens9 = await page.locator(".cell[data-given]").evaluateAll((c) => c.map((x) => x.getAttribute("data-cell")));
    await chooseSize(page, 6);
    await chooseSize(page, 9);
    const again = await page.locator(".cell[data-given]").evaluateAll((c) => c.map((x) => x.getAttribute("data-cell")));
    expect(again).toEqual(givens9);
  });

  test("New asks before replacing a game with progress, and History can reopen it", async ({ page }) => {
    await openApp(page);
    const givens = await page.locator(".cell[data-given]").evaluateAll((c) => c.map((x) => x.getAttribute("data-cell")));
    await emptyCell(page).click();
    await tool(page, "Fill notes").click();

    const newButton = page.getByRole("button", { name: /^(New|Sure\?)$/ });
    await newButton.click();
    await expect(newButton).toHaveText("Sure?");
    await newButton.click();
    await expect(newButton).toHaveText("New");

    await page.getByRole("button", { name: "History and stats" }).click();
    const dialog = page.getByRole("dialog", { name: "History and stats" });
    await expect(dialog.getByRole("listitem")).toHaveCount(2);
    await dialog.getByRole("listitem").nth(1).getByRole("button").first().click();
    await expect(dialog).toBeHidden();
    const reopened = await page.locator(".cell[data-given]").evaluateAll((c) => c.map((x) => x.getAttribute("data-cell")));
    expect(reopened).toEqual(givens);
  });
});

test.describe("finishing", () => {
  test("solving shows the solved card and records stats", async ({ page }) => {
    await openApp(page);
    await chooseSize(page, 6);
    const hint = tool(page, "Hint");
    // Solve by revealing every empty cell.
    for (;;) {
      const cell = page.locator(".cell:not([data-given]):not([data-hinted])").first();
      if ((await cell.count()) === 0) break;
      await cell.click();
      await hint.click();
    }
    const card = page.getByRole("dialog", { name: "Solved!" });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/First (Easy|Medium) 6×6 solve/);

    await card.getByRole("button", { name: "View board" }).click();
    await expect(card).toBeHidden();

    await page.getByRole("button", { name: "History and stats" }).click();
    await page.getByRole("tab", { name: "Stats" }).click();
    await expect(page.getByRole("row", { name: /6×6/ })).toContainText("1");
  });
});

test.describe("share links", () => {
  test("a link to a puzzle that doesn't exist falls back with a notice", async ({ page }) => {
    await page.goto("/p/zzzzzzzz");
    await expect(page.getByText("That puzzle link couldn't be opened")).toBeVisible({ timeout: GENERATE_TIMEOUT });
    await expect(page.locator(".cell")).toHaveCount(81, { timeout: GENERATE_TIMEOUT });
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("layout", () => {
  test("no horizontal scrolling and the board fits the screen", async ({ page }) => {
    await openApp(page);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    const board = await page.locator(".board").boundingBox();
    const viewport = page.viewportSize()!;
    expect(board!.x).toBeGreaterThanOrEqual(0);
    expect(board!.x + board!.width).toBeLessThanOrEqual(viewport.width);
    await expect(tool(page, "Fill notes")).toBeInViewport();
  });
});
