import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/features/auth/LoginForm";
import { ThemeToggle } from "@/features/theme/ThemeToggle";

export default async function LoginPage() {
  // Already signed in? Skip the form. This check lives here rather than in the
  // proxy because only the server can actually verify the session.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="login-wrap">
      <div className="login-theme-toggle">
        <ThemeToggle compact />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">
            AP
          </div>
          <div>
            <div className="brand-name" style={{ fontSize: 17 }}>
              Admin Portal
            </div>
            <div className="brand-sub">Sign in to your account</div>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
