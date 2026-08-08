"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/api-client";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { loginSchema } from "./schema";

export function LoginForm() {
  const router = useRouter();
  const { showError, reportError } = useErrorDialog();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Same schema the API uses, so the messages match on both sides.
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      showError(
        parsed.error.issues[0]?.message ?? "Check your details and try again.",
        "Sign in",
      );
      return;
    }

    setLoading(true);
    try {
      await apiJson("/api/auth/login", "POST", parsed.data);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      reportError(err, "Sign in failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="identifier">Email or mobile number</label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
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
