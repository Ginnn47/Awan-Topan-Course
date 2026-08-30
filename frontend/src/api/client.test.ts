import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ApiError, apiEnvelope, apiGet } from "./client";
import { apiErrorResponse, server } from "../test/server";

describe("API client", () => {
  it("membaca envelope sukses", async () => {
    server.use(
      http.get("/api/v1/example/", () =>
        HttpResponse.json({
          data: { value: 42 },
          meta: { request_id: "request-1" },
        }),
      ),
    );
    await expect(
      apiGet<{ value: number }>("/api/v1/example/"),
    ).resolves.toEqual({ value: 42 });
  });

  it("mengirim CSRF dan Idempotency-Key pada mutasi", async () => {
    document.cookie = "csrftoken=csrf-test-token";
    server.use(
      http.post("/api/v1/example/", async ({ request }) => {
        expect(request.headers.get("X-CSRFToken")).toBe("csrf-test-token");
        expect(request.headers.get("Idempotency-Key")).toBe("mutation-key");
        expect(await request.json()).toEqual({ name: "Awan" });
        return HttpResponse.json({ data: { saved: true }, meta: {} });
      }),
    );
    const response = await apiEnvelope<{ saved: boolean }>("/api/v1/example/", {
      method: "POST",
      idempotencyKey: "mutation-key",
      body: { name: "Awan" },
    });
    expect(response.data.saved).toBe(true);
  });

  it("mempertahankan structured 409 error", async () => {
    server.use(
      http.post("/api/v1/conflict/", () =>
        HttpResponse.json(
          {
            error: {
              code: "VERSION_CONFLICT",
              message: "Data telah berubah.",
              fields: { version: ["Muat ulang data terbaru."] },
              request_id: "request-conflict",
            },
          },
          { status: 409 },
        ),
      ),
    );
    const result = apiEnvelope("/api/v1/conflict/", {
      method: "POST",
      body: {},
    });
    await expect(result).rejects.toMatchObject({
      status: 409,
      detail: { code: "VERSION_CONFLICT", request_id: "request-conflict" },
    });
  });

  it("memancarkan event auth saat server mengembalikan 401", async () => {
    const listener = vi.fn();
    window.addEventListener("auth:unauthorized", listener);
    server.use(
      http.get("/api/v1/private/", () =>
        apiErrorResponse(401, "NOT_AUTHENTICATED", "Masuk kembali."),
      ),
    );
    await expect(apiGet("/api/v1/private/")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener("auth:unauthorized", listener);
  });
});
