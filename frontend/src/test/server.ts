import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const adminUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "topan@awantopan.local",
  full_name: "Mas Topan",
  role: "ADMIN" as const,
  teacher_id: null,
  permissions: {
    manage_academics: true,
    manage_schedule: true,
    manage_finance: true,
    record_assigned_payments: true,
    execute_assigned_sessions: true,
  },
};

export const teacherUser = {
  ...adminUser,
  id: "22222222-2222-4222-8222-222222222222",
  email: "layla@awantopan.local",
  full_name: "Mbak Layla",
  role: "TEACHER" as const,
  teacher_id: "33333333-3333-4333-8333-333333333333",
  permissions: {
    manage_academics: false,
    manage_schedule: false,
    manage_finance: false,
    record_assigned_payments: true,
    execute_assigned_sessions: true,
  },
};

const error = (status: number, code: string, message: string) =>
  HttpResponse.json(
    { error: { code, message, fields: {}, request_id: "test-request-id" } },
    { status },
  );

export const handlers = [
  http.get("/api/v1/auth/csrf/", () =>
    HttpResponse.json({
      data: { csrf: "set" },
      meta: { request_id: "test-request-id" },
    }),
  ),
  http.get("/api/v1/auth/me/", () =>
    error(401, "NOT_AUTHENTICATED", "Autentikasi diperlukan."),
  ),
];

export const server = setupServer(...handlers);
export { error as apiErrorResponse };
