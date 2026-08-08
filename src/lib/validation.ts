import { z } from "zod";
import { MODULE_KEYS, type ModuleKey } from "./modules";

// Shared field schemas. These are imported by BOTH the API routes and the
// client forms, so a rule is written once and enforced on both sides — the
// client for fast feedback, the server because the client can be bypassed.

/** Minimum password length. Raising this only affects newly-set passwords. */
export const MIN_PASSWORD_LENGTH = 12;

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, "Full name is required.")
  .max(120, "Full name must be 120 characters or fewer.");

/** Empty string is normalised to null so "cleared the field" reaches the DB as NULL. */
export const emailSchema = z
  .union([z.literal(""), z.email("Enter a valid email address.").max(255)])
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .nullable();

export const mobileSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(
        /^\+?[0-9][0-9\s-]{5,19}$/,
        "Enter a valid mobile number (digits, spaces and hyphens only).",
      ),
  ])
  .transform((v) => (v === "" || v == null ? null : v.replace(/\s+/g, " ")))
  .nullable();

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  )
  .max(200, "Password must be 200 characters or fewer.");

export const statusSchema = z.enum(["active", "disabled"]);

export const roleIdSchema = z
  .union([z.literal(""), z.coerce.number().int().positive()])
  .transform((v) => (v === "" ? null : v))
  .nullable();

/**
 * Profile photo URL.
 *
 * Restricted to paths this app itself serves. Accepting an arbitrary URL here
 * would let one admin set a photo pointing at a server they control and learn
 * the IP and user-agent of every other admin who views the user list.
 */
export const photoUrlSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .regex(
        /^\/api\/uploads\/[A-Za-z0-9._-]+$/,
        "Photo must be an uploaded file.",
      ),
  ])
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const moduleKeysSchema = z
  .array(z.string())
  .max(50)
  .transform((keys) =>
    keys.filter((k): k is ModuleKey =>
      (MODULE_KEYS as readonly string[]).includes(k),
    ),
  );

/**
 * A login account needs at least one way to sign in. The database enforces
 * this too (CHECK email_or_mobile), but catching it here produces a readable
 * message instead of a constraint-violation 500.
 */
export function requireEmailOrMobile<
  T extends { email: string | null; mobile: string | null },
>(value: T, ctx: z.RefinementCtx): void {
  if (!value.email && !value.mobile) {
    ctx.addIssue({
      code: "custom",
      message: "Provide at least an email address or a mobile number.",
      path: ["email"],
    });
  }
}
