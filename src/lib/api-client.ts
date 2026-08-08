import type { ApiEnvelope } from "./types";

// Client-side counterpart to src/lib/api.ts. No server-only imports here — it
// runs in the browser.

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * Calls an endpoint and unwraps the standard envelope.
 *
 * Resolves with `data` on success and throws `ApiRequestError` on anything
 * else, so callers can use one try/catch instead of checking `res.ok` and
 * `body.success` separately at every call site.
 */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  // Only a string body is JSON here (apiJson stringifies). A FormData body
  // must be left alone: the browser generates
  // `multipart/form-data; boundary=…` for it, and setting Content-Type
  // ourselves drops the boundary, so the server cannot parse the upload.
  const isJsonBody = typeof init?.body === "string";

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
      0,
    );
  }

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = null;
  }

  if (!body) {
    throw new ApiRequestError(
      "BAD_RESPONSE",
      `The server returned an unexpected response (${response.status}).`,
      response.status,
    );
  }

  if (!body.success) {
    throw new ApiRequestError(
      body.error.code,
      body.error.message,
      response.status,
    );
  }

  return body.data;
}

export function apiJson<T>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  payload?: unknown,
): Promise<T> {
  return apiFetch<T>(url, {
    method,
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
}

/** Turns any thrown value into a message safe to show the user. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
