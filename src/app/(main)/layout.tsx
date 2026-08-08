import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MODULES, allowedModules } from "@/lib/modules";
import AppShell from "@/components/AppShell";

/**
 * Authenticated shell.
 *
 * The nav is filtered to the modules this user's role grants — but that is a
 * convenience, not a control. Each page underneath independently calls
 * requirePageModule(), because a user can always type a URL.
 */
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const allowed = allowedModules(user.role);
  const nav = MODULES.filter((m) => allowed.includes(m.key));

  return (
    <AppShell user={user} nav={[...nav]}>
      {children}
    </AppShell>
  );
}
