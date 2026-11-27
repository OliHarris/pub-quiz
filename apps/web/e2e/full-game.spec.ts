import { expect, test } from "@playwright/test";
import { sampleQuiz } from "@pub-quiz/shared";
import { answer, joinAsTeam, openHost, roomCodeOf } from "./helpers";

/**
 * A whole game, end to end: one host screen and three phones, each in its own
 * browser context (separate cookies and storage, like separate devices).
 */

test("three teams play a full quiz, from joining to the final podium", async ({ browser }) => {
  const host = await openHost(browser, "/host/live/sample");
  const code = await roomCodeOf(host);

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
  const host = await openHost(browser, "/host/live/sample");
  const code = await roomCodeOf(host);

  const phonePage = await joinAsTeam(browser, code, "The Quizzly Bears");
  await host.getByRole("button", { name: /Start the quiz/ }).click();
  await expect(phonePage.getByRole("heading", { name: sampleQuiz.questions[0]!.text })).toBeVisible();

  await phonePage.reload();

  // Straight back into the question, no need to type the team name again.
  await expect(phonePage.getByRole("heading", { name: sampleQuiz.questions[0]!.text })).toBeVisible();
  await expect(phonePage.getByText("The Quizzly Bears")).toBeVisible();
});
