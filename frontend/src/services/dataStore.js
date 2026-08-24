export const DATA_CHANGE_EVENT = "awan-topan-data-changed";

let mutationSequence = 0;

function cloneFallback(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function inferDomain(storageKey = "") {
  if (storageKey.includes("operational-date")) return "settings";
  if (storageKey.includes("course-classes")) return "roster";
  if (storageKey.includes("course-sessions")) return "schedule";
  if (storageKey.includes("course-subjects")) return "catalog";
  if (storageKey.includes("session-records")) return "session";
  if (storageKey.includes("student-monthly")) return "attendance";
  if (storageKey.includes("finance") || storageKey.includes("billing-periods")) return "finance";
  return "application";
}

function createMutation(change = {}) {
  mutationSequence += 1;
  return {
    id: `local-${Date.now()}-${mutationSequence}`,
    domain: change.domain || "application",
    action: change.action || "replace",
    entityIds: change.entityIds || [],
    origin: change.origin || "user",
    occurredAt: new Date().toISOString(),
  };
}

export function readStorageJSON(storageKey, fallback) {
  if (typeof window === "undefined") return cloneFallback(fallback);
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? cloneFallback(fallback) : JSON.parse(raw);
  } catch {
    return cloneFallback(fallback);
  }
}

export function emitDataChange(change) {
  const mutation = createMutation(change);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, { detail: mutation }));
  }
  return mutation;
}

export function writeStorageJSON(storageKey, value, change = {}) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }
  const mutation = change.notify === false
    ? null
    : emitDataChange({ ...change, domain: change.domain || inferDomain(storageKey) });
  return { data: value, mutation };
}

export function commitStorageJSON(writes, change = {}) {
  if (typeof window !== "undefined") {
    writes.forEach(({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)));
  }
  const mutation = change.notify === false ? null : emitDataChange(change);
  return { data: writes.map(({ value }) => value), mutation };
}

export function subscribeDataChanges(listener, domains = []) {
  if (typeof window === "undefined") return () => {};
  const acceptedDomains = new Set(domains);
  const accepts = (domain) => acceptedDomains.size === 0 || acceptedDomains.has(domain);
  const onApplicationChange = (event) => {
    if (accepts(event.detail?.domain)) listener(event.detail);
  };
  const onStorageChange = (event) => {
    if (!event.key) return;
    const domain = inferDomain(event.key);
    if (accepts(domain)) listener(createMutation({ domain, action: "external-update", origin: "storage" }));
  };
  window.addEventListener(DATA_CHANGE_EVENT, onApplicationChange);
  window.addEventListener("storage", onStorageChange);
  return () => {
    window.removeEventListener(DATA_CHANGE_EVENT, onApplicationChange);
    window.removeEventListener("storage", onStorageChange);
  };
}
