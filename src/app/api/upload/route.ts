import type { NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/guard";
import { badRequest, ok, route } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  MAX_UPLOAD_BYTES,
  extensionFor,
  sniffImageKind,
  uploadsRoot,
} from "@/lib/uploads";

export const runtime = "nodejs";

/**
 * POST /api/upload — multipart form with a "file" field.
 *
 * Stores the image OUTSIDE public/ and returns the URL of the authenticated
 * route that serves it. Files under public/ are served statically by Next
 * before any of our code runs, so anything written there is world-readable
 * regardless of what the proxy or a route handler would like to say about it.
 */
export const POST = route("POST /api/upload", async (request: NextRequest) => {
  const me = await requireUser();

  const form = await request.formData();
  const file = form.get("file");

  if (!file || typeof file === "string") {
    throw badRequest("No file was provided.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest("Image must be 4 MB or smaller.");
  }
  if (file.size === 0) {
    throw badRequest("That file is empty.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // The only thing that decides what this file is.
  const kind = sniffImageKind(bytes);
  if (!kind) {
    logger.warn("upload rejected: not a recognised image", {
      userId: me.id,
      declaredType: file.type,
      size: file.size,
    });
    throw badRequest("Only PNG, JPG, WEBP or GIF images are allowed.");
  }

  // Random name: no user-controlled characters, and no way to guess another
  // user's filename by knowing their id.
  const name = `${crypto.randomUUID().replace(/-/g, "")}.${extensionFor(kind)}`;

  const dir = uploadsRoot();
  await mkdir(dir, { recursive: true });
  // See the note in src/lib/uploads.ts on why tracing is opted out here.
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, name), bytes, {
    mode: 0o640,
  });

  logger.info("photo uploaded", { userId: me.id, kind, size: file.size });

  return ok({ url: `/api/uploads/${name}` }, 201);
});
