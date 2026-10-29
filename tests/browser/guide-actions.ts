import { expect, type Page } from "@playwright/test";

/** C defaults to character-only; opening the dialogue is now an explicit user action. */
export async function openGuide(page: Page) {
  const dialogue = page.getByRole("region", { name: "引导者对话", exact: true });
  if (!await dialogue.isVisible()) await page.getByRole("button", { name: "展开记忆引导者", exact: true }).click();
  await expect(dialogue).toBeVisible();
}
