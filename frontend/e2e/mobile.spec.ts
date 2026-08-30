import { expect, test } from "@playwright/test";
import {
  adminEmail,
  adminPassword,
  requireCredentials,
  uiLogin,
} from "./helpers";

test.beforeEach(({ page }, testInfo) => {
  void page;
  test.skip(
    testInfo.project.name !== "mobile",
    "Smoke ini khusus viewport mobile.",
  );
});

test("login tetap utuh pada lebar mobile minimum", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Awan Topan" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Masuk/ })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("@smoke alur kritis dapat dibuka pada viewport mobile", async ({
  page,
}) => {
  const temporarySession = process.env.E2E_SESSION_ID;
  if (temporarySession) {
    await page.context().addCookies([
      {
        name: "sessionid",
        value: temporarySession,
        domain: "127.0.0.1",
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await page.goto("/dashboard");
  } else {
    requireCredentials();
    await uiLogin(page, adminEmail, adminPassword);
  }
  await expect(page.locator("main")).toBeVisible();

  const routes = [
    ["/dashboard", "Selamat datang,"],
    ["/course", "Manajemen Jadwal"],
    ["/rombel", "Rombel"],
    ["/finance", "Finance"],
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(
      page.getByText(heading, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu akun" })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);

    if (route === "/course") {
      const firstSession = page.locator('button[draggable="false"]').first();
      if (await firstSession.isVisible()) {
        await firstSession.click();
        await expect(
          page.getByText("Detail Jadwal", { exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Pengajar", { exact: true })).toBeVisible();
        await expect(
          page.getByText("Ruang Kelas", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Jumlah Siswa", { exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Tutup detail jadwal" }).click();
      }
    }
  }
});
