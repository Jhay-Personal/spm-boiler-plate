import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { requireUser } from "@/lib/guard";
import { notFound, route } from "@/lib/api";
import { mimeForStoredName, resolveStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

type Context = { params: Promise<{ name: string }> };

/**
 * GET /api/uploads/:name — serve an uploaded profile photo.
 *
 * Requires a session: profile photos are staff pictures and shouldn't be
 * enumerable by anonymous visitors. The response pins an explicit
 * Content-Type from our own extension allowlist and forbids sniffing, so even
 * if a file with unexpected content ever reached the directory, the browser
 * would not be talked into executing it.
 */
export const GET = route(
  "GET /api/uploads/[name]",
  async (_request: NextRequest, context: Context) => {
    await requireUser();

    const { name } = await context.params;
    const filePath = resolveStoredFile(name);
    if (!filePath) throw notFound("Image not found.");

    const contentType = mimeForStoredName(name);
    if (!contentType) throw notFound("Image not found.");

    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw notFound("Image not found.");

      const bytes = await readFile(filePath);
      return new NextResponse(new Uint8Array(bytes), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(info.size),
          "Content-Disposition": `inline; filename="${name}"`,
          "X-Content-Type-Options": "nosniff",
          // Private: these are per-user images behind auth, so no shared cache
          // should ever hold one.
          "Cache-Control": "private, max-age=3600, must-revalidate",
        },
      });
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "ENOENT"
      ) {
        throw notFound("Image not found.");
      }
      throw err;
    }
  },
);
