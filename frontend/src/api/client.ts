import type { ApiEnvelope, PageMeta } from "./types";

export interface ApiErrorBody {
  code: string;
  message: string;
  fields: Record<string, string[]>;
  request_id: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: ApiErrorBody,
  ) {
    super(detail.message);
    this.name = "ApiError";
  }
}

function cookie(name: string): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

export function queryString(
  values: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : "";
}

async function ensureCsrf(): Promise<string> {
  let token = cookie("csrftoken");
  if (!token) {
    await fetch("/api/v1/auth/csrf/", { credentials: "include" });
    token = cookie("csrftoken");
  }
  return token;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  idempotencyKey?: string;
}

export async function apiEnvelope<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers);
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRFToken", await ensureCsrf());
  }
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey);
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    body,
    credentials: "include",
  });
  if (response.status === 204) return { data: undefined as T, meta: {} };
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail: ApiErrorBody = payload?.error || {
      code: "HTTP_ERROR",
      message: "Permintaan tidak dapat diproses.",
      fields: {},
      request_id: response.headers.get("X-Request-ID") || "",
    };
    if (response.status === 401)
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    throw new ApiError(response.status, detail);
  }
  return payload as ApiEnvelope<T>;
}

export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  return (await apiEnvelope<T>(path, { signal })).data;
}

export async function apiListAll<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  let page = 1;
  const result: T[] = [];
  while (true) {
    const response = await apiEnvelope<T[]>(
      `${path}${separator}page=${page}&page_size=100`,
      { signal },
    );
    result.push(...response.data);
    const meta: PageMeta = response.meta || {};
    if (!meta.total || result.length >= meta.total) return result;
    page += 1;
  }
}

export const idempotencyKey = () => crypto.randomUUID();
