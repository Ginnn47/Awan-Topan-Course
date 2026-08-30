import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../auth/AuthProvider";
import { adminUser, apiErrorResponse, server } from "../test/server";
import LoginApi from "./LoginApi";

function renderLogin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route path="/login" element={<LoginApi />} />
            <Route
              path="/dashboard"
              element={<div>Dashboard berhasil dibuka</div>}
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Login", () => {
  it("tidak menampilkan pemilih role dan menunjukkan error backend", async () => {
    server.use(
      http.post("/api/v1/auth/login/", () =>
        apiErrorResponse(
          400,
          "VALIDATION_ERROR",
          "Email atau kata sandi tidak valid.",
        ),
      ),
    );
    renderLogin();
    fireEvent.change(await screen.findByLabelText("Email Akademik"), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Kata Sandi"), {
      target: { value: "salah" },
    });
    expect(screen.queryByText(/pilih role/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email atau kata sandi tidak valid.",
    );
  });

  it("menampilkan loading lalu berpindah setelah login sukses", async () => {
    server.use(
      http.post("/api/v1/auth/login/", async () => {
        await delay(80);
        return HttpResponse.json({ data: adminUser, meta: {} });
      }),
    );
    renderLogin();
    fireEvent.change(await screen.findByLabelText("Email Akademik"), {
      target: { value: adminUser.email },
    });
    fireEvent.change(screen.getByLabelText("Kata Sandi"), {
      target: { value: "password-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /masuk/i }));
    expect(screen.getByRole("button", { name: /memeriksa/i })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByText("Dashboard berhasil dibuka")).toBeInTheDocument(),
    );
  });
});
