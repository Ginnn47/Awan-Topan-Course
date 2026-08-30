import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

export const adminEmail =
  process.env.E2E_ADMIN_EMAIL || "topan@awantopan.local";
export const teacherEmail =
  process.env.E2E_TEACHER_EMAIL || "layla@awantopan.local";
export const otherTeacherEmail =
  process.env.E2E_OTHER_TEACHER_EMAIL || "dian@awantopan.local";
export const adminPassword = process.env.E2E_ADMIN_PASSWORD || "";
export const teacherPassword = process.env.E2E_TEACHER_PASSWORD || "";

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export function requireCredentials() {
  expect(adminPassword, "E2E_ADMIN_PASSWORD wajib diisi").not.toBe("");
  expect(teacherPassword, "E2E_TEACHER_PASSWORD wajib diisi").not.toBe("");
}

export async function responseData<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as
    Envelope<T> | { error?: { message?: string } };
  expect(
    response.ok(),
    `API ${response.url()} gagal (${response.status()}): ${JSON.stringify(body)}`,
  ).toBeTruthy();
  return (body as Envelope<T>).data;
}

export async function csrfToken(request: APIRequestContext) {
  const response = await request.get("/api/v1/auth/csrf/");
  expect(response.ok()).toBeTruthy();
  const state = await request.storageState();
  const cookie = state.cookies.find((item) => item.name === "csrftoken");
  expect(cookie, "Cookie CSRF tidak diterbitkan").toBeTruthy();
  return cookie!.value;
}

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  const token = await csrfToken(request);
  const response = await request.post("/api/v1/auth/login/", {
    data: { email, password },
    headers: { "X-CSRFToken": token },
  });
  await responseData(response);
  return csrfToken(request);
}

export async function mutationHeaders(
  request: APIRequestContext,
  idempotencyKey?: string,
) {
  const token = await csrfToken(request);
  return {
    "X-CSRFToken": token,
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

export async function uiLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email Akademik").fill(email);
  await page.getByLabel("Kata Sandi").fill(password);
  await page.getByRole("button", { name: /^Masuk/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Selamat datang,")).toBeVisible();
}

export function jakartaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}
