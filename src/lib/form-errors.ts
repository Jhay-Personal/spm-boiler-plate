import type { ZodError } from "zod";

// Maps a ZodError onto the fields of a form, so every problem can be shown at
// once under the input it belongs to. The counterpart to this file's output is
// `Field`, which renders a message, and `useFormErrors`, which holds the map.
//
// Deliberately NOT handled here: `invalid_union` issues are left with their own
// message. Zod 4 only reports one when no branch was plausible, and the nested
// branch messages are internals ("Invalid input: expected \"\"") — worse than
// the generic text. The fix for those belongs in the schema, as a written
// message on the union itself. See roleIdSchema in ./validation.ts.

export type FieldErrors = Record<string, string>;

/** Key used for issues that belong to the form rather than to one field. */
export const FORM_LEVEL_KEY = "_form";

/** The DOM id `Field` gives its control, and `useFormErrors` focuses by. */
export function fieldElementId(formId: string, name: string): string {
  return `${formId}-${name}`;
}

/**
 * One message per field. The first issue for a field wins — showing a stack of
 * messages under one input is noise, and the first is the one the user hits.
 */
export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : FORM_LEVEL_KEY;
    if (key in errors) continue;
    errors[key] = issue.message;
  }
  return errors;
}
