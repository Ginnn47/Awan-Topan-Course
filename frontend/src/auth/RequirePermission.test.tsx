import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { adminUser, server, teacherUser } from "../test/server";
import { queryKeys } from "../api/queryKeys";
import { AuthProvider } from "./AuthProvider";
import { RequirePermission } from "./RequirePermission";

function renderProtected(user: typeof adminUser | typeof teacherUser) {
  server.use(
    http.get("/api/v1/auth/me/", () =>
      HttpResponse.json({ data: user, meta: {} }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKeys.me, user);
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/finance"]}>
          <Routes>
            <Route path="/dashboard" element={<div>Dashboard</div>} />
            <Route
              path="/finance"
              element={
                <RequirePermission permission="manage_finance">
                  <div>Finance Privat</div>
                </RequirePermission>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("RequirePermission", () => {
  it("mengizinkan admin membuka Finance", async () => {
    renderProtected(adminUser);
    expect(await screen.findByText("Finance Privat")).toBeInTheDocument();
  });

  it("mengalihkan guru dari Finance", async () => {
    renderProtected(teacherUser);
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Finance Privat")).not.toBeInTheDocument();
  });
});
