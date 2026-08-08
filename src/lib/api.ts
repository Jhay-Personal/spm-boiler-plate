import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { describeError, logger } from "./logger";
import { isUniqueViolation, violatedConstraint } from "./db";
import type { ApiEnvelope } from "./types";

// Every endpoint in this app answers with the same envelope (declared in
// ./types so client code can import it too):
//
//   { "success": true,  "data": <T>, "error": null }
//   { "success": false, "data": null, "error": { "code": "...", "message": "..." } }
//
// Clients can therefore branch on `success` alone, and error rendering is
// uniform (see `useApi` on the client, which funnels failures into a modal).

export type { ApiEnvelope, ApiError } from "./types";

export function ok<T>(data: T, status = 200): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json<ApiEnvelope<T>>(
    { success: true, data, error: null },
    { status },
  );
}

export function fail(
  code: string,
  message: string,
  status: number,
): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json<ApiEnvelope<never>>(
    { success: false, data: null, error: { code, message } },
    { status },
  );
}

/**
 * An error that is safe to show the user verbatim. Anything else that escapes
 * a handler is logged in full and reported as a generic 500, so internal
 * details and stack traces never reach the client.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message = "You are not signed in.") =>
  new HttpError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "You do not have access to this module.") =>
  new HttpError(403, "FORBIDDEN", message);

export const notFound = (message = "Not found.") =>
  new HttpError(404, "NOT_FOUND", message);

export const badRequest = (message: string, code = "BAD_REQUEST") =>
  new HttpError(400, code, message);

export const conflict = (message: string) =>
  new HttpError(409, "CONFLICT", message);

/**
 * Wraps a route handler so that no handler has to repeat error plumbing —
 * and, more importantly, so that a handler cannot accidentally leak an
 * internal error message by forgetting a try/catch.
 */
export function route<Args extends unknown[]>(
  name: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return fail(err.code, err.message, err.status);
      }
      if (err instanceof ZodError) {
        return fail("VALIDATION_ERROR", firstZodMessage(err), 400);
      }
      if (isUniqueViolation(err)) {
        return fail("CONFLICT", uniqueViolationMessage(err), 409);
      }
      logger.error(`unhandled error in ${name}`, describeError(err));
      return fail(
        "INTERNAL_ERROR",
        "Something went wrong. Please try again.",
        500,
      );
    }
  };
}

function firstZodMessage(err: ZodError): string {
  return err.issues[0]?.message ?? "The submitted data is invalid.";
}

/**
 * Turns a unique-constraint violation into a message naming the field that
 * actually clashed, rather than guessing. Constraint names come from
 * db/admin_schema.sql.
 */
function uniqueViolationMessage(err: unknown): string {
  switch (violatedConstraint(err)) {
    case "admin_users_email_key":
      return "That email address is already in use.";
    case "admin_users_mobile_key":
      return "That mobile number is already in use.";
    case "roles_name_key":
      return "A group with that name already exists.";
    default:
      return "That value is already in use.";
  }
}

/** Reads a JSON request body, or throws a 400. Use when one body feeds two schemas. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
}

/** Validates an already-read body against a schema, or throws a 400. */
export function parseWith<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw badRequest(firstZodMessage(result.error), "VALIDATION_ERROR");
  }
  return result.data;
}

/** Parses a JSON request body against a schema, or throws a 400. */
export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  return parseWith(schema, await readJson(request));
}

/** Parses and validates a dynamic route segment that must be a positive integer id. */
export function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw badRequest("Invalid id.");
  }
  return id;
}
