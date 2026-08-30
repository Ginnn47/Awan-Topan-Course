import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

const values = new Map<string, string>();
const localStorage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  key: (index: number) => [...values.keys()][index] ?? null,
  removeItem: (key: string) => values.delete(key),
  setItem: (key: string, value: string) => values.set(key, String(value)),
};
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorage,
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  document.cookie.split(";").forEach((item) => {
    document.cookie = `${item.split("=")[0].trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });
});

afterAll(() => server.close());
