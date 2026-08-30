import { expect, test } from "@playwright/test";

test("@smoke halaman login tampil tanpa error runtime", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Tampilan mobile dicakup mobile smoke.",
  );
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Awan Topan" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Masuk/ })).toBeVisible();
  await page.screenshot({
    path: "test-results/login-screen.png",
    fullPage: true,
  });

  expect(runtimeErrors).toEqual([]);
});
