import { defineConfig, devices } from "@playwright/test";

const backendCommand =
  process.platform === "win32"
    ? ".venv\\Scripts\\python.exe manage.py runserver 127.0.0.1:8000 --noreload"
    : "python manage.py runserver 127.0.0.1:8000 --noreload";
const localChrome = process.env.CI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : [["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: backendCommand,
      cwd: "../backend",
      env: {
        ...process.env,
        DJANGO_SETTINGS_MODULE:
          process.env.DJANGO_SETTINGS_MODULE || "config.settings.local",
      },
      url: "http://127.0.0.1:8000/api/health/ready",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...localChrome },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], ...localChrome } },
  ],
});
