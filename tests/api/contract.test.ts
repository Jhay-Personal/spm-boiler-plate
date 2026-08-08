import { beforeAll, describe, expect, it } from "vitest";
import {
  TestClient,
  createRole,
  createUser,
  uniqueEmail,
  uniqueName,
  type RoleRow,
} from "./setup/client";

// The response envelope, input validation, and the security headers — the
// contract every client (and every future feature) depends on.

let admin: TestClient;

beforeAll(async () => {
  admin = new TestClient();
  await admin.loginAsAdmin();
});

describe("response envelope", () => {
  it("wraps a success as { success, data, error }", async () => {
    const result = await admin.get("/api/dashboard");
    expect(Object.keys(result.body!).sort()).toEqual(["data", "error", "success"]);
    expect(result.body).toMatchObject({ success: true, error: null });
  });

  it("wraps a failure with a code and a message", async () => {
    const result = await admin.get("/api/users/999999");
    expect(result.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  it("uses the same shape for auth failures", async () => {
    const result = await new TestClient().get("/api/users");
    expect(Object.keys(result.body!).sort()).toEqual(["data", "error", "success"]);
  });

  it("never leaks a stack trace or internal detail", async () => {
    const result = await admin.get("/api/users/999999");
    const serialised = JSON.stringify(result.body);
    expect(serialised).not.toMatch(/node_modules|\.next|at \w+ \(|password_hash/);
  });
});

describe("input validation", () => {
  it.each([
    ["a non-numeric role_id", { role_id: "abc" }],
    ["a negative role_id", { role_id: "-5" }],
    ["a fractional role_id", { role_id: "1.5" }],
  ])("rejects %s with 400 rather than a driver error", async (_label, overrides) => {
    // These used to reach Postgres as a 22P02 and surface as a 500.
    const result = await admin.post("/api/users", {
      full_name: "Bad Input",
      email: uniqueEmail("badinput"),
      mobile: "",
      password: "BadInputPassword123",
      photo_url: "",
      ...overrides,
    });
    expect(result.status).toBe(400);
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  it.each([
    ["a blank name", { full_name: "" }],
    ["a malformed email", { email: "not-an-email" }],
    ["no email and no mobile", { email: "", mobile: "" }],
    ["a short password", { password: "short" }],
    ["a malformed mobile", { mobile: "abc" }],
  ])("rejects %s", async (_label, overrides) => {
    const result = await admin.post("/api/users", {
      full_name: "Valid Name",
      email: uniqueEmail("valid"),
      mobile: "",
      password: "ValidPassword12345",
      role_id: "",
      photo_url: "",
      ...overrides,
    });
    expect(result.status).toBe(400);
  });

  it.each(["abc", "-1", "0", "1.5", "1%20OR%201=1"])(
    "rejects the malformed id %j in the path",
    async (id) => {
      const result = await admin.get(`/api/users/${id}`);
      expect(result.status).toBe(400);
      expect(result.code).toBe("BAD_REQUEST");
    },
  );

  it("rejects a body that is not JSON", async () => {
    const result = await admin.request("POST", "/api/roles", {
      body: "this is not json",
      headers: { "content-type": "application/json" },
    });
    expect(result.status).toBe(400);
  });

  it("rejects an over-long field", async () => {
    const result = await admin.post("/api/roles", {
      name: "x".repeat(500),
      description: "",
      modules: [],
    });
    expect(result.status).toBe(400);
  });

  it("returns a readable message, not a raw schema dump", async () => {
    const result = await admin.post("/api/users", {
      full_name: "Short Password",
      email: uniqueEmail("shortpw"),
      mobile: "",
      password: "short",
      role_id: "",
      photo_url: "",
    });
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("12 characters") },
    });
  });
});

describe("conflicts", () => {
  it("reports a duplicate email as 409, naming the field", async () => {
    const email = uniqueEmail("duplicate");
    await createUser(admin, { full_name: "First", email, password: "FirstPassword1234" });

    const result = await admin.post("/api/users", {
      full_name: "Second",
      email,
      mobile: "",
      password: "SecondPassword1234",
      role_id: "",
      photo_url: "",
    });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      error: { code: "CONFLICT", message: expect.stringContaining("email") },
    });
  });

  it("reports a duplicate group name as 409, naming the group", async () => {
    const name = uniqueName("Duplicate");
    await createRole(admin, name, ["dashboard"]);

    const result = await admin.post("/api/roles", {
      name,
      description: "",
      modules: [],
    });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("group") },
    });
  });
});

describe("roles", () => {
  it("silently drops module keys that do not exist", async () => {
    const name = uniqueName("Filtered");
    const roleId = await createRole(admin, name, ["dashboard"]);

    await admin.put(`/api/roles/${roleId}`, {
      name,
      description: "",
      modules: ["dashboard", "not_a_real_module", "viral_posts"],
    });

    const roles = await admin.get<{ roles: RoleRow[] }>("/api/roles");
    const role = roles.data!.roles.find((r) => r.id === roleId)!;
    expect(role.modules).toEqual(["dashboard"]);
  });

  it("cannot create a super role through the API", async () => {
    const roleId = await createRole(admin, uniqueName("NotSuper"), ["dashboard"]);
    const roles = await admin.get<{ roles: RoleRow[] }>("/api/roles");
    expect(roles.data!.roles.find((r) => r.id === roleId)!.is_super).toBe(false);
  });

  it("refuses to delete a group that is still assigned", async () => {
    const roleId = await createRole(admin, uniqueName("InUse"), ["dashboard"]);
    await createUser(admin, {
      full_name: "Assigned User",
      email: uniqueEmail("assigned"),
      password: "AssignedPassword123",
      role_id: roleId,
    });

    const result = await admin.del(`/api/roles/${roleId}`);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("Reassign") },
    });
  });

  it("deletes an unused group", async () => {
    const roleId = await createRole(admin, uniqueName("Unused"), []);
    expect((await admin.del(`/api/roles/${roleId}`)).status).toBe(200);
    expect((await admin.get(`/api/roles/${roleId}`)).status).toBe(404);
  });

  it("counts the users assigned to each group", async () => {
    const roleId = await createRole(admin, uniqueName("Counted"), ["dashboard"]);
    await createUser(admin, {
      full_name: "Counted One",
      email: uniqueEmail("counted"),
      password: "CountedPassword1234",
      role_id: roleId,
    });

    const roles = await admin.get<{ roles: RoleRow[] }>("/api/roles");
    expect(roles.data!.roles.find((r) => r.id === roleId)!.user_count).toBe(1);
  });
});

describe("security headers", () => {
  it.each([
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
  ])("sets %s", async (header, value) => {
    const res = await fetch(`${admin.baseUrl}/login`);
    expect(res.headers.get(header)).toBe(value);
  });

  it.each(["referrer-policy", "permissions-policy", "strict-transport-security"])(
    "sets %s",
    async (header) => {
      const res = await fetch(`${admin.baseUrl}/login`);
      expect(res.headers.get(header)).toBeTruthy();
    },
  );

  it("does not advertise the framework", async () => {
    const res = await fetch(`${admin.baseUrl}/login`);
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("sends a nonce-based CSP that forbids framing and plugins", async () => {
    const res = await fetch(`${admin.baseUrl}/login`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[0-9a-f]+'/);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("mints a fresh nonce for every request", async () => {
    const nonceOf = async () => {
      const res = await fetch(`${admin.baseUrl}/login`);
      return /nonce-([0-9a-f]+)/.exec(res.headers.get("content-security-policy") ?? "")?.[1];
    };
    const [first, second] = await Promise.all([nonceOf(), nonceOf()]);
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("puts that nonce on every script tag, so the page can hydrate", async () => {
    // A script without the nonce is blocked by the CSP, which would leave the
    // app rendered but dead.
    const res = await fetch(`${admin.baseUrl}/login`);
    const nonce = /nonce-([0-9a-f]+)/.exec(
      res.headers.get("content-security-policy") ?? "",
    )?.[1];
    const html = await res.text();
    const scripts = html.match(/<script[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) {
      expect(tag).toContain(`nonce="${nonce}"`);
    }
  });
});

describe("rate limiting", () => {
  it("throttles guesses at one account even when the source IP rotates", async () => {
    // Each TestClient carries a different x-forwarded-for, so this is an
    // attacker cycling through proxies against a single known admin address.
    // The per-identifier limit is what has to stop them.
    const identifier = uniqueEmail("bruteforce");
    const codes: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      codes.push((await new TestClient().login(identifier, "WrongPassword12345")).status);
    }
    expect(codes.slice(0, 8)).toEqual(Array(8).fill(401));
    expect(codes.slice(8)).toEqual([429, 429]);
  });

  it("throttles one IP spraying many different accounts", async () => {
    // The mirror case: one source, many identifiers, so only the per-IP limit
    // applies. Both limiters have to work for the pair to be useful.
    const attacker = new TestClient(undefined, "203.0.113.99");
    const codes: number[] = [];
    for (let i = 0; i < 24; i += 1) {
      codes.push(
        (await attacker.login(uniqueEmail("spray"), "WrongPassword12345")).status,
      );
    }
    expect(codes[0]).toBe(401);
    expect(codes.at(-1)).toBe(429);
  });

  it("leaves an unrelated account and IP untouched", async () => {
    const result = await new TestClient().login(
      uniqueEmail("innocent"),
      "WrongPassword12345",
    );
    expect(result.status).toBe(401);
  });

  it("explains how long to wait", async () => {
    const identifier = uniqueEmail("retryafter");
    let last;
    for (let i = 0; i < 10; i += 1) {
      last = await new TestClient().login(identifier, "WrongPassword12345");
    }
    expect(last!.status).toBe(429);
    expect(last!.body).toMatchObject({
      error: { code: "TOO_MANY_ATTEMPTS", message: expect.stringContaining("minute") },
    });
  });

  it("clears the counter after a successful sign-in", async () => {
    const email = uniqueEmail("recovers");
    const password = "RecoversPassword123";
    await createUser(admin, { full_name: "Recovers", email, password });

    const client = new TestClient();
    for (let i = 0; i < 5; i += 1) await client.login(email, "WrongPassword12345");
    expect((await client.login(email, password)).status).toBe(200);

    // A user who mistypes a few times then succeeds must not stay penalised.
    const after = new TestClient();
    expect((await after.login(email, password)).status).toBe(200);
  });
});
