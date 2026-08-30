import { describe, expect, it } from "vitest";
import {
  getOperationalDate,
  getPhysicalToday,
  isOperationalDateOverridden,
  isValidBusinessDate,
  resetOperationalDate,
  setOperationalDate,
} from "./operationalDateService.js";

describe("tanggal operasional", () => {
  it("memvalidasi tanggal kalender lokal", () => {
    expect(isValidBusinessDate("2026-08-30")).toBe(true);
    expect(isValidBusinessDate("2026-02-30")).toBe(false);
    expect(isValidBusinessDate("30-08-2026")).toBe(false);
  });

  it("menyimpan override dan dapat kembali ke hari fisik", () => {
    const simulated =
      getPhysicalToday() === "2035-01-15" ? "2035-01-16" : "2035-01-15";
    expect(setOperationalDate(simulated)).toBe(simulated);
    expect(getOperationalDate()).toBe(simulated);
    expect(isOperationalDateOverridden()).toBe(true);
    expect(resetOperationalDate()).toBe(getPhysicalToday());
    expect(getOperationalDate()).toBe(getPhysicalToday());
  });

  it("menolak nilai invalid", () => {
    expect(() => setOperationalDate("invalid")).toThrow(
      "Tanggal operasional tidak valid",
    );
  });
});
