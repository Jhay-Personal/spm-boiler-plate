import { beforeAll, describe, expect, it } from "vitest";
import {
  HTML_PAYLOAD,
  TestClient,
  VALID_PNG,
  createUser,
  uniqueEmail,
} from "./setup/client";

// Upload handling is the difference between a profile photo feature and a
// stored-XSS hole. The rule: the file's own bytes decide what it is.

let admin: TestClient;

beforeAll(async () => {
  admin = new TestClient();
  await admin.loginAsAdmin();
});

const bytesWith = (signature: number[], length = 64) => {
  const out = new Uint8Array(length);
  out.set(signature);
  return out;
};

describe("accepting an upload", () => {
  it("stores a real PNG under a random name with the right extension", async () => {
    const result = await admin.upload(VALID_PNG, "avatar.png", "image/png");
    expect(result.status).toBe(201);
    expect(result.data!.url).toMatch(/^\/api\/uploads\/[0-9a-f]{32}\.png$/);
  });

  it("ignores the client's filename and Content-Type entirely", async () => {
    // A PNG announced as text/html named evil.html must still be stored as
    // a .png, because only the magic bytes are trusted.
    const result = await admin.upload(VALID_PNG, "evil.html", "text/html");
    expect(result.status).toBe(201);
    expect(result.data!.url).toMatch(/\.png$/);
    expect(result.data!.url).not.toContain("evil");
    expect(result.data!.url).not.toContain("html");
  });

  it.each([
    ["JPEG", [0xff, 0xd8, 0xff, 0xe0], "jpg"],
    ["GIF", [0x47, 0x49, 0x46, 0x38], "gif"],
    [
      "WEBP",
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
      "webp",
    ],
  ])("detects a %s and gives it the .%s extension", async (_label, signature, ext) => {
    const result = await admin.upload(bytesWith(signature), "x.png", "image/png");
    expect(result.status).toBe(201);
    expect(result.data!.url.endsWith(`.${ext}`)).toBe(true);
  });

  it("gives every upload a distinct name", async () => {
    const a = await admin.upload(VALID_PNG, "a.png", "image/png");
    const b = await admin.upload(VALID_PNG, "b.png", "image/png");
    expect(a.data!.url).not.toBe(b.data!.url);
  });
});

describe("rejecting an upload", () => {
  it("refuses HTML disguised as an image", async () => {
    // The stored-XSS attempt: without magic-byte sniffing this file lands in
    // the uploads directory and is served same-origin as text/html.
    const result = await admin.upload(HTML_PAYLOAD, "innocent.png", "image/png");
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: { message: expect.stringContaining("PNG") },
    });
  });

  it.each([
    ["an SVG (scriptable)", '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'],
    ["a shell script", "#!/bin/sh\nrm -rf /"],
    ["PHP", "<?php system($_GET['c']); ?>"],
    ["plain text", "not an image at all"],
  ])("refuses %s", async (_label, content) => {
    const result = await admin.upload(
      new TextEncoder().encode(content),
      "file.png",
      "image/png",
    );
    expect(result.status).toBe(400);
  });

  it("refuses an empty file", async () => {
    expect((await admin.upload(new Uint8Array(0), "empty.png", "image/png")).status).toBe(
      400,
    );
  });

  it("refuses a file over the 4 MB cap", async () => {
    const oversized = new Uint8Array(4 * 1024 * 1024 + 1);
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect((await admin.upload(oversized, "big.png", "image/png")).status).toBe(400);
  });

  it("refuses a request with no file field", async () => {
    const form = new FormData();
    form.append("notfile", "x");
    const result = await admin.request("POST", "/api/upload", { body: form });
    expect(result.status).toBe(400);
  });

  it("refuses an anonymous upload", async () => {
    expect(
      (await new TestClient().upload(VALID_PNG, "a.png", "image/png")).status,
    ).toBe(401);
  });
});

describe("serving an upload", () => {
  let url: string;

  beforeAll(async () => {
    url = (await admin.upload(VALID_PNG, "served.png", "image/png")).data!.url;
  });

  it("requires a session", async () => {
    expect((await new TestClient().get(url)).status).toBe(401);
  });

  it("serves the image to a signed-in user", async () => {
    const result = await admin.get(url);
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/png");
  });

  it("pins the type and forbids sniffing", async () => {
    const result = await admin.get(url);
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.get("content-disposition")).toContain("inline");
  });

  it("marks the response private so no shared cache stores it", async () => {
    expect((await admin.get(url)).headers.get("cache-control")).toContain("private");
  });

  it.each([
    ["path traversal", "/api/uploads/..%2f..%2f..%2fetc%2fpasswd"],
    ["an HTML extension", "/api/uploads/0123456789abcdef0123456789abcdef.html"],
    ["a name we would never generate", "/api/uploads/evil.png"],
    ["an unknown but well-formed name", "/api/uploads/00000000000000000000000000000000.png"],
  ])("returns 404 for %s", async (_label, pathname) => {
    expect((await admin.get(pathname)).status).toBe(404);
  });

  it("is not reachable as a static file under /uploads", async () => {
    // Anything under public/ is served before our code runs, so uploads must
    // not live there. A redirect to /login proves the proxy handled it as an
    // ordinary app route rather than a static asset.
    const name = url.split("/").pop();
    const result = await new TestClient().get(`/uploads/${name}`);
    expect(result.status).not.toBe(200);
  });
});

describe("photo_url on a profile", () => {
  it("accepts a URL that came from our upload route", async () => {
    const uploaded = await admin.upload(VALID_PNG, "profile.png", "image/png");
    const result = await admin.put("/api/profile", {
      full_name: "Administrator",
      email: "test-admin@example.test",
      mobile: "",
      photo_url: uploaded.data!.url,
    });
    expect(result.status).toBe(200);

    const profile = await admin.get<{ user: { photo_url: string } }>("/api/profile");
    expect(profile.data!.user.photo_url).toBe(uploaded.data!.url);
  });

  it.each([
    ["an external tracker", "https://tracker.example.test/pixel.png"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:image/png;base64,AAAA"],
    ["a traversal path", "/api/uploads/../../etc/passwd"],
  ])("refuses %s", async (_label, photo_url) => {
    // An arbitrary URL here would let one admin deanonymise every colleague
    // who merely opens the user list.
    const result = await admin.put("/api/profile", {
      full_name: "Administrator",
      email: "test-admin@example.test",
      mobile: "",
      photo_url,
    });
    expect(result.status).toBe(400);
  });

  it("is also enforced when creating a user", async () => {
    const result = await admin.post("/api/users", {
      full_name: "Tracker Victim",
      email: uniqueEmail("tracker"),
      mobile: "",
      password: "TrackerPassword12345",
      role_id: "",
      photo_url: "https://tracker.example.test/pixel.png",
    });
    expect(result.status).toBe(400);
  });

  it("lets a user clear their photo", async () => {
    const email = uniqueEmail("clearphoto");
    const password = "ClearPhotoPassword123";
    await createUser(admin, { full_name: "Clear Photo", email, password });

    const client = new TestClient();
    await client.login(email, password);
    const uploaded = await client.upload(VALID_PNG, "p.png", "image/png");

    await client.put("/api/profile", {
      full_name: "Clear Photo",
      email,
      mobile: "",
      photo_url: uploaded.data!.url,
    });
    await client.put("/api/profile", {
      full_name: "Clear Photo",
      email,
      mobile: "",
      photo_url: "",
    });

    const profile = await client.get<{ user: { photo_url: string | null } }>(
      "/api/profile",
    );
    expect(profile.data!.user.photo_url).toBeNull();
  });
});
