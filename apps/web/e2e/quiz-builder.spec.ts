import { expect, test } from "@playwright/test";
import { answer, joinAsTeam, openHost, roomCodeOf } from "./helpers";

/**
 * The milestone 2 journey: a host writes their own quiz (one question by hand,
 * one from the question bank), plays it, and finds the saved results on their
 * dashboard afterwards.
 */
test("a host builds a quiz, plays it, and finds the results on their dashboard", async ({ browser }) => {
  const host = await openHost(browser, "/host/quizzes/new");
  const title = `Playwright Quiz ${Date.now()}`;

  // Saving an empty quiz shows what's missing, without calling the server.
  await host.getByRole("button", { name: "Save", exact: true }).click();
  await expect(host.getByText("Give your quiz a title")).toBeVisible();

  await host.getByLabel("Quiz title").fill(title);

  // Question 1, written by hand, with only two answers.
  await host.getByLabel("Question 1 text").fill("Is the Earth round?");
  await host.getByLabel("Question 1, answer A").fill("Yes");
  await host.getByLabel("Question 1, answer B").fill("No");
  await host.getByRole("button", { name: "Remove answer D" }).click();
  await host.getByRole("button", { name: "Remove answer C" }).click();
  await host.getByLabel("Answer A is correct").check();

  // Question 2, from the question bank.
  await host.getByRole("button", { name: /Add from the question bank/ }).click();
  await host.getByLabel("Search questions").fill("capital of Australia");
  await host.getByRole("button", { name: "Add: What is the capital of Australia?" }).click();
  await host.getByRole("button", { name: "Done" }).click();
  await expect(host.getByLabel("Question 2 text")).toHaveValue("What is the capital of Australia?");

  // Save and go straight to the TV screen.
  await host.getByRole("button", { name: /Save & play/ }).click();
  await expect(host).toHaveURL(/\/host\/live\/[0-9a-f-]{36}$/);
  await expect(host.getByText(title)).toBeVisible();
  const code = await roomCodeOf(host);

  const team = await joinAsTeam(browser, code, "The Testers");
  await host.getByRole("button", { name: /Start the quiz/ }).click();

  await answer(team, 0, "Yes");
  await host.getByRole("button", { name: /Show scores/ }).click();
  await host.getByRole("button", { name: /Next question/ }).click();
  await answer(team, 2, "Canberra");
  await host.getByRole("button", { name: /Show scores/ }).click();
  await host.getByRole("button", { name: /Final results/ }).click();
  await expect(host.getByRole("heading", { name: "Final scores" })).toBeVisible();

  // The results were saved, and show up on the dashboard.
  await host.getByRole("link", { name: "Back to dashboard" }).click();
  const yourQuizzes = host.getByRole("region", { name: "Your quizzes" });
  await expect(yourQuizzes.getByText(title)).toBeVisible();
  const pastGames = host.getByRole("region", { name: "Past games" });
  await pastGames.getByRole("link", { name: new RegExp(title) }).click();

  await expect(host.getByRole("heading", { name: title })).toBeVisible();
  await expect(host.getByRole("cell", { name: "The Testers" })).toBeVisible();
});
