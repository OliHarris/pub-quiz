import { devices, expect, test, type Browser, type Page } from "@playwright/test";
import { sampleQuiz } from "@pub-quiz/shared";

/**
 * A whole game, end to end: one host screen and three phones, each in its own
 * browser context (separate cookies and storage, like separate devices).
 */

// A phone-sized, touch-screen browser.
const pixel = devices["Pixel 7"];
const phone = {
  viewport: pixel.viewport,
  userAgent: pixel.userAgent,
  deviceScaleFactor: pixel.deviceScaleFactor,
  isMobile: pixel.isMobile,
  hasTouch: pixel.hasTouch,
};
const LETTERS = ["A", "B", "C", "D"];

async function joinAsTeam(browser: Browser, code: string, name: string): Promise<Page> {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  await page.goto(`/play/${code}`);
  await page.getByLabel("Team name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByRole("heading", { name: "You're in!" })).toBeVisible();
  return page;
}

async function answer(page: Page, optionIndex: number, optionText: string) {
  await page.getByRole("button", { name: `${LETTERS[optionIndex]}: ${optionText}`, exact: true }).click();
}

test("three teams play a full quiz, from joining to the final podium", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const host = await hostContext.newPage();
  await host.goto("/host");

  const roomCode = host.getByTestId("room-code");
  await expect(roomCode).toHaveText(/^[A-Z]{4}$/);
  const code = (await roomCode.textContent())!;

  const [bears, mockingbird, quizerables] = await Promise.all([
    joinAsTeam(browser, code, "The Quizzly Bears"),
    joinAsTeam(browser, code, "Tequila Mockingbird"),
    joinAsTeam(browser, code, "Les Quizerables"),
  ]);
  for (const name of ["The Quizzly Bears", "Tequila Mockingbird", "Les Quizerables"]) {
    await expect(host.getByText(name)).toBeVisible();
  }

  await host.getByRole("button", { name: /Start the quiz/ }).click();

  for (const [i, question] of sampleQuiz.questions.entries()) {
    const right = question.correctIndex;
    const wrong = (right + 1) % question.options.length;
    const isLast = i === sampleQuiz.questions.length - 1;

    await expect(host.getByRole("heading", { name: question.text })).toBeVisible();
    await expect(bears.getByRole("heading", { name: question.text })).toBeVisible();

    // The Bears always get it right. Mockingbird gets every other one. Les Quizerables never do.
    await answer(bears, right, question.options[right]!);
    const mockingbirdChoice = i % 2 === 0 ? right : wrong;
    await answer(mockingbird, mockingbirdChoice, question.options[mockingbirdChoice]!);
    await answer(quizerables, wrong, question.options[wrong]!);

    // Everyone has answered, so the question closes without waiting for the timer.
    await expect(host.getByText(`${i % 2 === 0 ? 2 : 1} of 3 teams got it right`)).toBeVisible();
    await expect(bears.getByRole("heading", { name: "Correct!" })).toBeVisible();
    await expect(quizerables.getByRole("heading", { name: "Not this time" })).toBeVisible();

    await host.getByRole("button", { name: /Show scores/ }).click();
    await expect(host.getByTestId("leaderboard")).toBeVisible();
    await host.getByRole("button", { name: isLast ? /Final results/ : /Next question/ }).click();
  }

  await expect(host.getByRole("heading", { name: "Final scores" })).toBeVisible();
  await host.waitForTimeout(1500); // let the podium animation finish for the screenshot
  await host.screenshot({ path: "test-results/screens/final-podium.png" });
  await expect(bears.getByText("1st", { exact: true })).toBeVisible();
  await expect(mockingbird.getByText("2nd", { exact: true })).toBeVisible();
  await expect(quizerables.getByText("3rd", { exact: true })).toBeVisible();
});

test("a phone that refreshes mid-game rejoins as the same team", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  await host.goto("/host");
  const roomCode = host.getByTestId("room-code");
  await expect(roomCode).toHaveText(/^[A-Z]{4}$/);
  const code = (await roomCode.textContent())!;

  const phonePage = await joinAsTeam(browser, code, "The Quizzly Bears");
  await host.getByRole("button", { name: /Start the quiz/ }).click();
  await expect(phonePage.getByRole("heading", { name: sampleQuiz.questions[0]!.text })).toBeVisible();

  await phonePage.reload();

  // Straight back into the question, no need to type the team name again.
  await expect(phonePage.getByRole("heading", { name: sampleQuiz.questions[0]!.text })).toBeVisible();
  await expect(phonePage.getByText("The Quizzly Bears")).toBeVisible();
});
