import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MODULES, allowedModules } from "@/lib/modules";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const allowed = allowedModules(user.role);
  const nav = MODULES.filter((m) => allowed.includes(m.key));

  return (
    <AppShell user={user} nav={nav}>
      {children}
    </AppShell>
  );
}
