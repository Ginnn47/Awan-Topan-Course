import fs from "node:fs";

const endpoint = "http://127.0.0.1:9334";
const tabs = await fetch(`${endpoint}/json`).then((response) => response.json());
const page = tabs.find((tab) => tab.type === "page");
if (!page) throw new Error("Chrome page target not found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let requestId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message));
  else handlers.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const countsExpression = `(() => {
  const count = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value.length : Object.keys(value || {}).length; } catch { return -1; } };
  return {
    sessions: count("awan-topan-course-sessions-v4"),
    invoices: count("awan-topan-finance-invoices-v3"),
    transactions: count("awan-topan-finance-transactions-v3"),
    attendance: count("awan-topan-student-monthly-records-v3"),
  };
})()`;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://127.0.0.1:5173/dashboard" });
await wait(1000);
await evaluate(`localStorage.setItem("awan-topan-current-role", "admin"); localStorage.removeItem("awan-topan-operational-date-v1"); location.href = "/dashboard";`);
await wait(3500);
const before = await evaluate(countsExpression);

await evaluate(`document.querySelector('button[title="Atur tanggal operasional"]')?.click()`);
await wait(300);
const pickerState = await evaluate(`({ title: document.title, text: document.body.innerText.slice(0, 500), adminButton: Boolean(document.querySelector('button[title="Atur tanggal operasional"]')), dateInput: Boolean(document.querySelector('input[type="date"]')) })`);
if (!pickerState.dateInput) throw new Error(`Date picker did not open: ${JSON.stringify(pickerState)}`);
await evaluate(`(() => { const input = document.querySelector('input[type="date"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, "2026-09-01"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); })()`);
await wait(300);
await evaluate(`[...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "Terapkan")?.click()`);
await wait(300);
await evaluate(`[...document.querySelectorAll("button")].find((button) => button.textContent.includes("Ya, Terapkan"))?.click()`);
await wait(2500);

const after = await evaluate(countsExpression);
const dashboardState = await evaluate(`({
  override: JSON.parse(localStorage.getItem("awan-topan-operational-date-v1")),
  simulationVisible: document.body.innerText.toLowerCase().includes("mode simulasi"),
  selectedDateVisible: document.body.innerText.includes("1 September 2026"),
  text: document.body.innerText.slice(0, 900),
})`);
const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
fs.writeFileSync("operational-date-check.png", Buffer.from(screenshot.data, "base64"));

await send("Page.navigate", { url: "http://127.0.0.1:5173/finance" });
await wait(2000);
const financeState = await evaluate(`({
  simulationVisible: document.body.innerText.toLowerCase().includes("mode simulasi"),
  septemberContext: document.body.innerText.includes("September 2026"),
  emptyPeriod: document.body.innerText.includes("belum dibuat"),
})`);

await send("Page.navigate", { url: "http://127.0.0.1:5173/course/sessions/session-1-1" });
await wait(1800);
await evaluate(`[...document.querySelectorAll("button")].find((button) => button.textContent.includes("Mulai Sesi"))?.click()`);
await wait(300);
const sessionState = await evaluate(`({ mismatchWarning: document.body.innerText.includes("Tanggal sesi berbeda"), overrideStillActive: Boolean(localStorage.getItem("awan-topan-operational-date-v1")) })`);

await send("Page.navigate", { url: "http://127.0.0.1:5173/course" });
await wait(1600);
const courseState = await evaluate(`({ simulationVisible: document.body.innerText.toLowerCase().includes("mode simulasi"), operationalButton: document.body.innerText.includes("Tanggal operasional"), septemberContext: document.body.innerText.includes("September 2026") || document.body.innerText.includes("Agustus 2026") })`);

await send("Page.navigate", { url: "http://127.0.0.1:5173/dashboard" });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await wait(1500);
const mobileScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
fs.writeFileSync("operational-date-mobile-check.png", Buffer.from(mobileScreenshot.data, "base64"));
const mobileState = await evaluate(`({ simulationVisible: document.body.innerText.toLowerCase().includes("mode simulasi"), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth })`);

await evaluate(`localStorage.removeItem("awan-topan-operational-date-v1")`);
await send("Page.reload", { ignoreCache: true });
await wait(1500);
const resetState = await evaluate(`({ override: localStorage.getItem("awan-topan-operational-date-v1"), simulationVisible: document.body.innerText.toLowerCase().includes("mode simulasi"), counts: ${countsExpression} })`);

console.log(JSON.stringify({ before, after, unchanged: JSON.stringify(before) === JSON.stringify(after), dashboardState, financeState, sessionState, courseState, mobileState, resetState }, null, 2));
socket.close();
