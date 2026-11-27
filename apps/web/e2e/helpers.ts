import { devices, expect, type Browser, type Page } from "@playwright/test";

/** A phone-sized, touch-screen browser. */
const pixel = devices["Pixel 7"];
export const phone = {
  viewport: pixel.viewport,
  userAgent: pixel.userAgent,
  deviceScaleFactor: pixel.deviceScaleFactor,
  isMobile: pixel.isMobile,
  hasTouch: pixel.hasTouch,
};

const LETTERS = ["A", "B", "C", "D"];

/** A TV-sized host screen in its own browser context (its own storage, so its own host identity). */
export async function openHost(browser: Browser, path: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

/** Reads the room code off the host's lobby screen. */
export async function roomCodeOf(host: Page): Promise<string> {
  const roomCode = host.getByTestId("room-code");
  await expect(roomCode).toHaveText(/^[A-Z]{4}$/);
  return (await roomCode.textContent())!;
}

export async function joinAsTeam(browser: Browser, code: string, name: string): Promise<Page> {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await page.goto(`/play/${code}`);
  await page.getByLabel("Team name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: "You're in!" })).toBeVisible();
  return page;
}

export async function answer(page: Page, optionIndex: number, optionText: string) {
  await page.getByRole("button", { name: `${LETTERS[optionIndex]}: ${optionText}`, exact: true }).click();
}
