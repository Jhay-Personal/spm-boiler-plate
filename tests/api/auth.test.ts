import { beforeAll, describe, expect, it } from "vitest";
import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  TestClient,
  createUser,
  uniqueEmail,
} from "./setup/client";

let admin: TestClient;

beforeAll(async () => {
  admin = new TestClient();
  await admin.loginAsAdmin();
});

describe("sign in", () => {
  it("accepts correct credentials and issues a session", async () => {
    const client = new TestClient();
    const result = await client.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    expect(result.status).toBe(200);
    expect(client.hasCookie()).toBe(true);
    expect((await client.get("/api/profile")).status).toBe(200);
  });

  it("sets the session cookie httpOnly, secure and sameSite", async () => {
    const client = new TestClient();
    const result = await client.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const cookie = result.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    // NODE_ENV=production in the test harness, so Secure must be set.
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/");
  });

  it("returns the same generic message for a wrong password and an unknown user", async () => {
    // Distinct messages would let an attacker enumerate valid admin accounts.
    const wrongPassword = await new TestClient().login(TEST_ADMIN_EMAIL, "wrong-password");
    const unknownUser = await new TestClient().login(
      "no-such-person@example.test",
      "wrong-password",
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.code).toBe("INVALID_CREDENTIALS");
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it("does not issue a cookie on a failed attempt", async () => {
    const client = new TestClient();
    await client.login(TEST_ADMIN_EMAIL, "wrong-password");
    expect(client.hasCookie()).toBe(false);
  });

  it.each([
    ["an empty body", {}],
    ["a missing password", { identifier: TEST_ADMIN_EMAIL }],
    ["a missing identifier", { password: "something-long-enough" }],
    ["a blank identifier", { identifier: "   ", password: "something-long" }],
  ])("rejects %s with 400", async (_label, payload) => {
    const result = await new TestClient().post("/api/auth/login", payload);
    expect(result.status).toBe(400);
  });

  it("treats a SQL injection attempt as an ordinary failed sign-in", async () => {
    const result = await new TestClient().login("' OR 1=1 --", "anything-at-all");
    expect(result.status).toBe(401);
    expect(result.code).toBe("INVALID_CREDENTIALS");
  });

  it("matches the email case-insensitively", async () => {
    const client = new TestClient();
    const result = await client.login(TEST_ADMIN_EMAIL.toUpperCase(), TEST_ADMIN_PASSWORD);
    expect(result.status).toBe(200);
  });
});

describe("sign out", () => {
  it("clears the session", async () => {
    const client = new TestClient();
    await client.loginAsAdmin();
    expect((await client.get("/api/profile")).status).toBe(200);

    const result = await client.post("/api/auth/logout");
    expect(result.status).toBe(200);
    expect((await client.get("/api/profile")).status).toBe(401);
  });

  it("clears the cookie with the same attributes it was set with", async () => {
    // A mismatched path or sameSite would leave the original cookie in place.
    const client = new TestClient();
    await client.loginAsAdmin();
    const result = await client.post("/api/auth/logout");
    const cookie = result.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toMatch(/Max-Age=0/i);
  });
});

describe("session tokens", () => {
  it("rejects a garbage cookie", async () => {
    const result = await new TestClient().request("GET", "/api/profile", {
      headers: { cookie: "admin_session=not-a-real-token" },
    });
    expect(result.status).toBe(401);
  });

  it("rejects an unsigned (alg:none) token", async () => {
    const encode = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");
    const forged = `${encode({ alg: "none", typ: "JWT" })}.${encode({
      uid: 1,
      tv: 0,
      exp: 9_999_999_999,
    })}.`;
    const result = await new TestClient().request("GET", "/api/profile", {
      headers: { cookie: `admin_session=${forged}` },
    });
    expect(result.status).toBe(401);
  });

  it("rejects a genuine token whose signature has been swapped", async () => {
    const client = new TestClient();
    const login = await client.login(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    const raw = /admin_session=([^;]*)/.exec(login.headers.get("set-cookie") ?? "")?.[1];
    const tampered = `${raw!.split(".").slice(0, 2).join(".")}.AAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const result = await new TestClient().request("GET", "/api/profile", {
      headers: { cookie: `admin_session=${tampered}` },
    });
    expect(result.status).toBe(401);
  });
});

describe("session revocation", () => {
  it("a super admin's password reset ends the target's existing sessions", async () => {
    const email = uniqueEmail("revoke");
    const password = "RevokeMePassword123";
    const userId = await createUser(admin, {
      full_name: "Revoke Me",
      email,
      password,
    });

    const victim = new TestClient();
    await victim.login(email, password);
    expect((await victim.get("/api/profile")).status).toBe(200);

    await admin.post(`/api/users/${userId}/reset-password`, {
      password: "AdminChosenPassword123",
    });

    // Without this, resetting a compromised account's password would leave
    // the attacker's session alive for up to eight hours.
    expect((await victim.get("/api/profile")).status).toBe(401);
  });

  it("changing your own password signs out other browsers but not this one", async () => {
    const email = uniqueEmail("twobrowsers");
    const password = "FirstPassword12345";
    await createUser(admin, { full_name: "Two Browsers", email, password });

    const browserA = new TestClient();
    const browserB = new TestClient();
    await browserA.login(email, password);
    await browserB.login(email, password);

    const changed = await browserB.put("/api/profile", {
      full_name: "Two Browsers",
      email,
      mobile: "",
      current_password: password,
      new_password: "SecondPassword12345",
    });
    expect(changed.status).toBe(200);

    expect((await browserA.get("/api/profile")).status).toBe(401);
    expect((await browserB.get("/api/profile")).status).toBe(200);
  });

  it("disabling an account ends its session immediately and blocks sign-in", async () => {
    const email = uniqueEmail("disabled");
    const password = "WillBeDisabled12345";
    const userId = await createUser(admin, {
      full_name: "Soon Disabled",
      email,
      password,
    });

    const client = new TestClient();
    await client.login(email, password);
    expect((await client.get("/api/profile")).status).toBe(200);

    await admin.put(`/api/users/${userId}`, {
      full_name: "Soon Disabled",
      email,
      mobile: "",
      status: "disabled",
    });

    expect((await client.get("/api/profile")).status).toBe(401);
    expect((await new TestClient().login(email, password)).status).toBe(401);
  });

  it("re-enabling an account restores sign-in", async () => {
    const email = uniqueEmail("reenable");
    const password = "ReEnablePassword123";
    const userId = await createUser(admin, {
      full_name: "Re Enabled",
      email,
      password,
    });

    for (const status of ["disabled", "active"]) {
      await admin.put(`/api/users/${userId}`, {
        full_name: "Re Enabled",
        email,
        mobile: "",
        status,
      });
    }

    expect((await new TestClient().login(email, password)).status).toBe(200);
  });

  it("a deleted user's session stops working", async () => {
    const email = uniqueEmail("deleted");
    const password = "WillBeDeleted12345";
    const userId = await createUser(admin, {
      full_name: "Soon Deleted",
      email,
      password,
    });

    const client = new TestClient();
    await client.login(email, password);
    expect((await client.get("/api/profile")).status).toBe(200);

    await admin.del(`/api/users/${userId}`);
    expect((await client.get("/api/profile")).status).toBe(401);
  });
});

describe("changing your own password", () => {
  it("requires the current password", async () => {
    const email = uniqueEmail("ownpw");
    const password = "OwnPasswordFirst123";
    await createUser(admin, { full_name: "Own Password", email, password });

    const client = new TestClient();
    await client.login(email, password);

    const result = await client.put("/api/profile", {
      full_name: "Own Password",
      email,
      mobile: "",
      current_password: "not-the-right-one",
      new_password: "OwnPasswordSecond123",
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("current password") },
    });

    // And the password really did not change.
    expect((await new TestClient().login(email, password)).status).toBe(200);
  });

  it("cannot be aimed at another account", async () => {
    // PUT /api/profile takes no id — it is structurally incapable of
    // targeting anyone but the caller.
    const client = new TestClient();
    await client.loginAsAdmin();
    const result = await client.put("/api/profile", {
      full_name: "Administrator",
      email: TEST_ADMIN_EMAIL,
      mobile: "",
      id: 999,
      user_id: 999,
    });
    expect(result.status).toBe(200);
    const profile = await client.get<{ user: { email: string } }>("/api/profile");
    expect(profile.data!.user.email).toBe(TEST_ADMIN_EMAIL);
  });
});
