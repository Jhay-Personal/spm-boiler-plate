import type { ApiEnvelope } from "@/lib/types";

// A tiny HTTP client for the integration tests.
//
// It keeps its own cookie jar per instance, so a test can hold several
// independent "browsers" at once — which is how the session-revocation tests
// prove that changing a password signs out the *other* browser but not this one.

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3311";

export const TEST_ADMIN_EMAIL = "test-admin@example.test";
export const TEST_ADMIN_PASSWORD = "TestAdminPassword123";

export type ApiResult<T> = {
  status: number;
  body: ApiEnvelope<T> | null;
  /** Error code when the call failed, or null when it succeeded. */
  code: string | null;
  /** Unwrapped data on success, else null. */
  data: T | null;
  headers: Headers;
};

let ipCounter = 0;

/**
 * A distinct source IP per client instance.
 *
 * Every request in this suite really does come from 127.0.0.1, so without
 * this the per-IP login limiter (20 attempts / 15 min — correct production
 * behaviour) would exhaust partway through the run and fail unrelated tests.
 * Giving each client its own forwarded address models what it is actually
 * simulating: separate browsers on separate machines.
 */
function nextTestIp(): string {
  ipCounter += 1;
  return `10.${Math.floor(ipCounter / 65536) % 256}.${Math.floor(ipCounter / 256) % 256}.${ipCounter % 256}`;
}

export class TestClient {
  private cookie: string | null = null;
  /** Source address sent as x-forwarded-for. */
  readonly ip: string;

  constructor(readonly baseUrl: string = BASE_URL, ip?: string) {
    this.ip = ip ?? nextTestIp();
  }

  /** Discards the session without telling the server — simulates a stale browser. */
  forgetCookie(): void {
    this.cookie = null;
  }

  hasCookie(): boolean {
    return this.cookie !== null;
  }

  async request<T = unknown>(
    method: string,
    pathname: string,
    options: { json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {},
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      "x-forwarded-for": this.ip,
      ...options.headers,
    };
    if (this.cookie) headers.cookie = this.cookie;

    let body: BodyInit | undefined = options.body;
    if (options.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.json);
    }

    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = /admin_session=([^;]*)/.exec(setCookie);
      if (match) {
        this.cookie = match[1] ? `admin_session=${match[1]}` : null;
      }
    }

    let parsed: ApiEnvelope<T> | null = null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        parsed = (await response.json()) as ApiEnvelope<T>;
      } catch {
        parsed = null;
      }
    }

    return {
      status: response.status,
      body: parsed,
      code: parsed && !parsed.success ? parsed.error.code : null,
      data: parsed && parsed.success ? parsed.data : null,
      headers: response.headers,
    };
  }

  get<T = unknown>(pathname: string) {
    return this.request<T>("GET", pathname);
  }
  post<T = unknown>(pathname: string, json?: unknown) {
    return this.request<T>("POST", pathname, { json });
  }
  put<T = unknown>(pathname: string, json?: unknown) {
    return this.request<T>("PUT", pathname, { json });
  }
  del<T = unknown>(pathname: string) {
    return this.request<T>("DELETE", pathname);
  }

  async login(identifier: string, password: string) {
    return this.post<{ id: number }>("/api/auth/login", { identifier, password });
  }

  async loginAsAdmin() {
    const result = await this.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    if (result.status !== 200) {
      throw new Error(`Could not sign in as the test admin: ${result.status}`);
    }
    return result;
  }

  /** Uploads raw bytes as a multipart form, the way the browser does. */
  async upload(bytes: Uint8Array, filename: string, contentType: string) {
    const form = new FormData();
    form.append("file", new Blob([bytes as unknown as BlobPart], { type: contentType }), filename);
    return this.request<{ url: string }>("POST", "/api/upload", { body: form });
  }
}

export type UserRow = {
  id: number;
  full_name: string;
  email: string | null;
  mobile: string | null;
  photo_url: string | null;
  status: "active" | "disabled";
  role_id: number | null;
  role_name: string | null;
};

export type RoleRow = {
  id: number;
  name: string;
  description: string | null;
  modules: string[];
  is_super: boolean;
  user_count: number;
};

/** Signs in as the super admin and creates a user with the given role. */
export async function createUser(
  admin: TestClient,
  input: {
    full_name: string;
    email: string;
    password: string;
    role_id?: number | null;
  },
): Promise<number> {
  const result = await admin.post<{ id: number }>("/api/users", {
    full_name: input.full_name,
    email: input.email,
    mobile: "",
    password: input.password,
    role_id: input.role_id ?? "",
    photo_url: "",
  });
  if (result.status !== 201 || !result.data) {
    throw new Error(
      `createUser failed (${result.status}): ${JSON.stringify(result.body)}`,
    );
  }
  return result.data.id;
}

/** Creates a non-super role granting exactly the given modules. */
export async function createRole(
  admin: TestClient,
  name: string,
  modules: string[],
): Promise<number> {
  const result = await admin.post<{ id: number }>("/api/roles", {
    name,
    description: `Test role: ${modules.join(", ") || "no modules"}`,
    modules,
  });
  if (result.status !== 201 || !result.data) {
    throw new Error(
      `createRole failed (${result.status}): ${JSON.stringify(result.body)}`,
    );
  }
  return result.data.id;
}

/** A valid, minimal PNG — real magic bytes, so the sniffer accepts it. */
export const VALID_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

/** HTML bytes — used to prove a disguised file is rejected. */
export const HTML_PAYLOAD = new TextEncoder().encode(
  "<html><script>alert(document.domain)</script></html>",
);

let uniqueCounter = 0;
/** Unique-per-call identifier so tests never collide on the UNIQUE constraints. */
export function uniqueEmail(prefix = "user"): string {
  uniqueCounter += 1;
  return `${prefix}-${uniqueCounter}-${process.pid}@example.test`;
}

export function uniqueName(prefix = "Role"): string {
  uniqueCounter += 1;
  return `${prefix} ${uniqueCounter}-${process.pid}`;
}
