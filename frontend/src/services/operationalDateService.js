import { emitDataChange, readStorageJSON, writeStorageJSON } from "./dataStore.js";

const OPERATIONAL_DATE_STORAGE_KEY = "awan-topan-operational-date-v1";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pad = (value) => String(value).padStart(2, "0");

export function getPhysicalToday() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidBusinessDate(value) {
  if (!DATE_PATTERN.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function getOperationalDate() {
  const stored = readStorageJSON(OPERATIONAL_DATE_STORAGE_KEY, "");
  return isValidBusinessDate(stored) ? stored : getPhysicalToday();
}

export function isOperationalDateOverridden() {
  return getOperationalDate() !== getPhysicalToday();
}

export function setOperationalDate(value) {
  if (!isValidBusinessDate(value)) throw new Error("Tanggal operasional tidak valid.");
  if (value === getPhysicalToday()) return resetOperationalDate();
  writeStorageJSON(OPERATIONAL_DATE_STORAGE_KEY, value, {
    domain: "settings",
    action: "set-operational-date",
    entityIds: [value],
  });
  return value;
}

export function resetOperationalDate() {
  if (typeof window !== "undefined") window.localStorage.removeItem(OPERATIONAL_DATE_STORAGE_KEY);
  emitDataChange({ domain: "settings", action: "reset-operational-date", entityIds: [getPhysicalToday()] });
  return getPhysicalToday();
}

export { OPERATIONAL_DATE_STORAGE_KEY };
