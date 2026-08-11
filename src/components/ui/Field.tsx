"use client";

import type { ReactNode } from "react";
import { fieldElementId } from "@/lib/form-errors";

// Owns the wiring between a label, a control, its hint and its error message,
// so no call site has to remember aria-describedby.
//
// A render prop rather than cloneElement: the props are typed, the control
// stays an ordinary <input>/<select>, and nothing is injected invisibly.

export type FieldControlProps = {
  id: string;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
};

type FieldProps = {
  /** Shared with useFormErrors — together they determine the control's id. */
  formId: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (control: FieldControlProps) => ReactNode;
};

export default function Field({
  formId,
  name,
  label,
  hint,
  error,
  required = false,
  children,
}: FieldProps) {
  const id = fieldElementId(formId, name);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={"field" + (error ? " has-error" : "")}>
      <label htmlFor={id}>
        {label}
        {required && " *"}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint && (
        <div className="hint" id={hintId}>
          {hint}
        </div>
      )}
      {/* No role="alert" here: a form failing four fields would fire four
          announcements at once. The message is reached through the focused
          field's aria-describedby instead, which announces exactly one. */}
      {error && (
        <div className="field-error" id={errorId}>
          {error}
        </div>
      )}
    </div>
  );
}
