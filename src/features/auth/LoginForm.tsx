"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/ui/Field";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
import { apiJson } from "@/lib/api-client";
import { loginSchema } from "./schema";

export function LoginForm() {
  const router = useRouter();
  const { reportError } = useErrorDialog();
  const { errors, validate, clearField } = useFormErrors("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Same schema the API uses, so the messages match on both sides.
    const parsed = validate(loginSchema, { identifier, password });
    if (!parsed) return;

    setLoading(true);
    try {
      await apiJson("/api/auth/login", "POST", parsed);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      // Rejected credentials are a server decision, not a field problem, and
      // the message is deliberately generic — it must not say which half was
      // wrong. It belongs in the modal.
      reportError(err, "Sign in failed");
      setLoading(false);
    }
  }

  return (
    // noValidate, and no `required` attributes: the browser's own bubble would
    // pre-empt this validation and show only the first field, which is the
    // behaviour being removed.
    <form onSubmit={onSubmit} noValidate>
      <Field
        formId="login"
        name="identifier"
        label="Email or mobile number"
        error={errors.identifier}
      >
        {(control) => (
          <input
            {...control}
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              clearField("identifier");
            }}
          />
        )}
      </Field>
      <Field
        formId="login"
        name="password"
        label="Password"
        error={errors.password}
      >
        {(control) => (
          <input
            {...control}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearField("password");
            }}
          />
        )}
      </Field>
      <button
        type="submit"
        className="btn primary"
        disabled={loading}
        style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
