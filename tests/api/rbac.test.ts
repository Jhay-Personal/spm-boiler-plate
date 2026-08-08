import { beforeAll, describe, expect, it } from "vitest";
import {
  TestClient,
  createRole,
  createUser,
  uniqueEmail,
  uniqueName,
  type UserRow,
} from "./setup/client";

// The regression suite for this project's central defect.
//
// Before the guards existed, roles were stored and rendered but never
// enforced: any signed-in user could read and write every account, and
// promote themselves to super admin with one request. Each test below names
// the specific escalation it prevents.

const VIEWER_PASSWORD = "ViewerPassword12345";
const MANAGER_PASSWORD = "ManagerPassword12345";

let admin: TestClient;
/** Role granting only `dashboard`. */
let viewer: TestClient;
let viewerId: number;
/** Role granting `users` — but NOT super. This is the dangerous middle tier. */
let manager: TestClient;
let managerId: number;
let adminId: number;

beforeAll(async () => {
  admin = new TestClient();
  const login = await admin.loginAsAdmin();
  adminId = login.data!.id;

  const viewerRole = await createRole(admin, uniqueName("Viewer"), ["dashboard"]);
  const managerRole = await createRole(admin, uniqueName("Manager"), [
    "dashboard",
    "users",
  ]);

  const viewerEmail = uniqueEmail("viewer");
  viewerId = await createUser(admin, {
    full_name: "Vera Viewer",
    email: viewerEmail,
    password: VIEWER_PASSWORD,
    role_id: viewerRole,
  });
  viewer = new TestClient();
  await viewer.login(viewerEmail, VIEWER_PASSWORD);

  const managerEmail = uniqueEmail("manager");
  managerId = await createUser(admin, {
    full_name: "Mal Manager",
    email: managerEmail,
    password: MANAGER_PASSWORD,
    role_id: managerRole,
  });
  manager = new TestClient();
  await manager.login(managerEmail, MANAGER_PASSWORD);
});

describe("unauthenticated access", () => {
  const anon = new TestClient();

  it.each([
    ["GET", "/api/users"],
    ["GET", "/api/users/1"],
    ["GET", "/api/roles"],
    ["GET", "/api/roles/1"],
    ["GET", "/api/dashboard"],
    ["GET", "/api/profile"],
    ["POST", "/api/upload"],
    ["GET", "/api/uploads/0123456789abcdef0123456789abcdef.png"],
  ])("refuses %s %s with 401", async (method, pathname) => {
    const result = await anon.request(method, pathname);
    expect(result.status).toBe(401);
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it.each(["/dashboard", "/users", "/roles", "/profile"])(
    "redirects the page %s to /login",
    async (pathname) => {
      const result = await anon.request("GET", pathname);
      expect(result.status).toBe(307);
      expect(result.headers.get("location")).toContain("/login");
    },
  );
});

describe("a role that grants only `dashboard`", () => {
  it("can reach the module it was granted", async () => {
    expect((await viewer.get("/api/dashboard")).status).toBe(200);
  });

  it("can always reach its own profile", async () => {
    expect((await viewer.get("/api/profile")).status).toBe(200);
  });

  it.each([
    ["GET", "/api/users"],
    ["GET", "/api/users/1"],
    ["GET", "/api/roles"],
    ["GET", "/api/roles/1"],
  ])("cannot read %s %s", async (method, pathname) => {
    const result = await viewer.request(method, pathname);
    expect(result.status).toBe(403);
    expect(result.code).toBe("FORBIDDEN");
  });

  it("cannot create a user", async () => {
    const result = await viewer.post("/api/users", {
      full_name: "Smuggled",
      email: uniqueEmail("smuggled"),
      mobile: "",
      password: "SmuggledPassword123",
      role_id: "",
      photo_url: "",
    });
    expect(result.status).toBe(403);
  });

  it("cannot create or delete a role", async () => {
    expect(
      (await viewer.post("/api/roles", { name: "Sneaky", description: "", modules: [] }))
        .status,
    ).toBe(403);
    expect((await viewer.del("/api/roles/1")).status).toBe(403);
  });

  it("is redirected away from pages its role does not grant", async () => {
    for (const pathname of ["/users", "/roles"]) {
      const result = await viewer.request("GET", pathname);
      expect(result.status).toBe(307);
      expect(result.headers.get("location")).toContain("/dashboard");
    }
  });

  it("cannot delete an account", async () => {
    expect((await viewer.del(`/api/users/${adminId}`)).status).toBe(403);
  });
});

describe("privilege escalation is refused", () => {
  it("a viewer cannot promote itself by setting role_id", async () => {
    // The original defect: PUT your own id with a different role_id.
    const result = await viewer.put(`/api/users/${viewerId}`, {
      full_name: "Vera Viewer",
      email: uniqueEmail("vera"),
      mobile: "",
      role_id: 1,
    });
    expect(result.status).toBe(403);
  });

  it("a users-module admin cannot promote itself either", async () => {
    // Holding `users` is the tempting case: it grants user editing, but must
    // not grant the ability to hand out roles.
    const result = await manager.put(`/api/users/${managerId}`, {
      full_name: "Mal Manager",
      email: uniqueEmail("mal"),
      mobile: "",
      role_id: 1,
    });
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("super admin") },
    });
  });

  it("a users-module admin cannot promote somebody else", async () => {
    const result = await manager.put(`/api/users/${viewerId}`, {
      full_name: "Vera Viewer",
      email: uniqueEmail("vera"),
      mobile: "",
      role_id: 1,
    });
    expect(result.status).toBe(403);
  });

  it("a users-module admin cannot disable another account", async () => {
    const result = await manager.put(`/api/users/${viewerId}`, {
      full_name: "Vera Viewer",
      email: uniqueEmail("vera"),
      mobile: "",
      status: "disabled",
    });
    expect(result.status).toBe(403);
  });

  it("a users-module admin cannot reset anyone's password", async () => {
    // Resetting a password without proving anything about the account IS
    // account takeover, so it needs super, not merely the users module.
    const result = await manager.post(`/api/users/${viewerId}/reset-password`, {
      password: "TakenOverPassword123",
    });
    expect(result.status).toBe(403);
  });

  it("a users-module admin cannot edit a super admin", async () => {
    // Otherwise: change the super admin's email, then use password recovery.
    const result = await manager.put(`/api/users/${adminId}`, {
      full_name: "Administrator",
      email: uniqueEmail("attacker"),
      mobile: "",
    });
    expect(result.status).toBe(403);
  });

  it("a users-module admin cannot delete a super admin", async () => {
    expect((await manager.del(`/api/users/${adminId}`)).status).toBe(403);
  });

  it("a users-module admin CAN do its legitimate job", async () => {
    // The guard must not be so broad that the role becomes useless.
    const result = await manager.put(`/api/users/${viewerId}`, {
      full_name: "Vera Viewer Renamed",
      email: uniqueEmail("vera"),
      mobile: "",
    });
    expect(result.status).toBe(200);
    expect((await manager.get("/api/users")).status).toBe(200);
  });
});

describe("self-protection applies even to a super admin", () => {
  it("cannot change its own role", async () => {
    const result = await admin.put(`/api/users/${adminId}`, {
      full_name: "Administrator",
      email: "test-admin@example.test",
      mobile: "",
      role_id: 2,
    });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("your own role") },
    });
  });

  it("cannot disable itself and lock everyone out", async () => {
    const result = await admin.put(`/api/users/${adminId}`, {
      full_name: "Administrator",
      email: "test-admin@example.test",
      mobile: "",
      status: "disabled",
    });
    expect(result.status).toBe(400);
  });

  it("cannot delete its own account", async () => {
    const result = await admin.del(`/api/users/${adminId}`);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("your own account") },
    });
  });

  it("cannot delete the Super Admin group", async () => {
    const roles = await admin.get<{ roles: { id: number; is_super: boolean }[] }>(
      "/api/roles",
    );
    const superRole = roles.data!.roles.find((r) => r.is_super)!;
    const result = await admin.del(`/api/roles/${superRole.id}`);
    expect(result.status).toBe(400);
  });

  it("cannot narrow the Super Admin group's module list", async () => {
    const roles = await admin.get<{ roles: { id: number; is_super: boolean; name: string }[] }>(
      "/api/roles",
    );
    const superRole = roles.data!.roles.find((r) => r.is_super)!;
    const result = await admin.put(`/api/roles/${superRole.id}`, {
      name: superRole.name,
      description: "attempted lockout",
      modules: [],
    });
    // The rename is accepted; the module list is ignored for a super role.
    expect(result.status).toBe(200);

    const after = await admin.get<{ roles: { id: number; is_super: boolean }[] }>(
      "/api/roles",
    );
    expect(after.data!.roles.find((r) => r.id === superRole.id)!.is_super).toBe(true);
    // Proof it still has full access: a super-only endpoint still works.
    expect((await admin.get("/api/users")).status).toBe(200);
  });
});

describe("the super admin retains full access", () => {
  it.each([
    "/api/dashboard",
    "/api/users",
    "/api/roles",
    "/api/profile",
  ])("can reach %s", async (pathname) => {
    expect((await admin.get(pathname)).status).toBe(200);
  });

  it("can assign a role to another user", async () => {
    const roleId = await createRole(admin, uniqueName("Assignable"), ["dashboard"]);
    const result = await admin.put(`/api/users/${viewerId}`, {
      full_name: "Vera Viewer",
      email: uniqueEmail("vera"),
      mobile: "",
      role_id: roleId,
    });
    expect(result.status).toBe(200);

    const users = await admin.get<{ users: UserRow[] }>("/api/users");
    expect(users.data!.users.find((u) => u.id === viewerId)!.role_id).toBe(roleId);
  });

  it("never returns password hashes in the user list", async () => {
    const users = await admin.get<{ users: UserRow[] }>("/api/users");
    const serialised = JSON.stringify(users.data);
    expect(serialised).not.toContain("password_hash");
    expect(serialised).not.toMatch(/\$2[aby]\$/);
  });
});
