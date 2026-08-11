"use client";

import { useCallback, useState } from "react";
import type { ZodType } from "zod";
import {
  fieldElementId,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/lib/form-errors";

// Holds the per-field validation state for one form, and moves focus to the
// first problem so a keyboard or screen-reader user is not left guessing which
// of six fields was rejected.

/**
 * Focuses the errored field that comes first *in the document*, which is not
 * necessarily the first issue Zod reported — Zod walks the schema in
 * declaration order, and a schema's field order need not match the form's.
 * Focusing by issue order would skip the user past a visible error.
 */
function focusFirstError(formId: string, errors: FieldErrors): void {
  const elements = Object.keys(errors)
    .map((name) => document.getElementById(fieldElementId(formId, name)))
    .filter((element): element is HTMLElement => element !== null);

  if (elements.length === 0) return;

  const first = elements.reduce((earliest, element) =>
    earliest.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING
      ? element
      : earliest,
  );

  first.focus();
}

export function useFormErrors(formId: string) {
  const [errors, setErrors] = useState<FieldErrors>({});

  /** Returns the parsed value, or null after recording every field's error. */
  const validate = useCallback(
    <T,>(schema: ZodType<T>, input: unknown): T | null => {
      const result = schema.safeParse(input);
      if (result.success) {
        setErrors({});
        return result.data;
      }
      const next = fieldErrorsFromZod(result.error);
      setErrors(next);
      // After paint, so the elements being focused have rendered their errors.
      requestAnimationFrame(() => focusFirstError(formId, next));
      return null;
    },
    [formId],
  );

  /**
   * For rules that are not in a Zod schema — see ProfileClient's password
   * confirmation, which the server never receives and so cannot validate.
   */
  const setFieldError = useCallback(
    (name: string, message: string) => {
      setErrors((current) => ({ ...current, [name]: message }));
      requestAnimationFrame(() => focusFirstError(formId, { [name]: message }));
    },
    [formId],
  );

  /** Called from each control's onChange, so a message clears as it is fixed. */
  const clearField = useCallback((name: string) => {
    setErrors((current) => {
      if (!(name in current)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, validate, setFieldError, clearField, reset };
}
