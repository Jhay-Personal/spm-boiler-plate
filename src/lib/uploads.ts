import "server-only";
import path from "node:path";
import { uploadDir } from "./env";

// Image handling rules, shared by the upload and download routes.
//
// The single most important rule: the stored file's extension and the
// Content-Type we serve it with are BOTH derived from the file's own magic
// bytes. Neither the browser-supplied `Content-Type` nor the original
// filename is trusted for anything. Trusting either is what turns a profile
// photo upload into stored XSS — send `evil.html` labelled `image/png` and a
// naive implementation writes an HTML file the server will happily serve
// same-origin.

export type ImageKind = "png" | "jpeg" | "webp" | "gif";

const KIND_TO_EXTENSION: Record<ImageKind, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
};

const KIND_TO_MIME: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

/** Identifies an image by its signature, or returns null if it is not one we accept. */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  const startsWith = (...signature: number[]): boolean =>
    signature.every((byte, i) => bytes[i] === byte);

  // PNG: \x89 P N G \r \n \x1a \n
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  // JPEG: FF D8 FF
  if (startsWith(0xff, 0xd8, 0xff)) return "jpeg";
  // GIF: "GIF8"
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "gif";
  // WEBP: "RIFF" .... "WEBP"
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function extensionFor(kind: ImageKind): string {
  return KIND_TO_EXTENSION[kind];
}

export function mimeForKind(kind: ImageKind): string {
  return KIND_TO_MIME[kind];
}

/** Content-Type for a stored filename, or null if the extension isn't one of ours. */
export function mimeForStoredName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_MIME[ext] ?? null;
}

/** Filenames we generate: a UUID plus a known-good extension. Nothing else is served. */
const STORED_NAME = /^[0-9a-f]{32}\.(png|jpg|webp|gif)$/;

export function isValidStoredName(name: string): boolean {
  return STORED_NAME.test(name);
}

// The uploads directory is configured at runtime (UPLOAD_DIR), so the bundler
// cannot statically scope these path calls. Left un-annotated, Turbopack
// conservatively traces the entire project into the server output. The
// directory is deliberately runtime-configurable, so we opt out of tracing
// rather than hard-coding a path.
export function uploadsRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), uploadDir());
}

/**
 * Resolves a stored filename to an absolute path inside the uploads root.
 *
 * Returns null when the name isn't one we could have generated, or when the
 * resolved path escapes the root. The name check alone makes traversal
 * impossible; the containment check is kept as a second, independent barrier.
 */
export function resolveStoredFile(name: string): string | null {
  if (!isValidStoredName(name)) return null;

  const root = uploadsRoot();
  const resolved = path.resolve(/*turbopackIgnore: true*/ root, name);
  if (resolved !== path.join(/*turbopackIgnore: true*/ root, name)) return null;
  if (!resolved.startsWith(root + path.sep)) return null;

  return resolved;
}
