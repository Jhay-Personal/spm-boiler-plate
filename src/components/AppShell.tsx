"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link, { useLinkStatus } from "next/link";
import { Icon } from "@/components/icons";
import Avatar from "./ui/Avatar";
import { useErrorDialog } from "./ui/ErrorDialogProvider";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { apiJson } from "@/lib/api-client";
import { groupedModules, type ModuleDefinition } from "@/lib/modules";
import type { CurrentUser } from "@/lib/types";

type AppShellProps = {
  user: CurrentUser;
  nav: ModuleDefinition[];
  children: React.ReactNode;
};

/**
 * Pending dot for the link being navigated to. `useLinkStatus` reports the
 * transition of its nearest ancestor Link, so this must be rendered inside one.
 */
function NavPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="nav-pending" aria-hidden="true" /> : null;
}

export default function AppShell({ user, nav, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { reportError } = useErrorDialog();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const current =
    nav.find((m) => pathname === m.path || pathname.startsWith(m.path + "/")) ??
    null;
  const title = current?.label ?? "Admin Portal";

  async function signOut() {
    setSigningOut(true);
    try {
      await apiJson("/api/auth/logout", "POST");
      router.push("/login");
      router.refresh();
    } catch (err) {
      reportError(err, "Could not sign out");
      setSigningOut(false);
    }
  }

  return (
    <div className={"app-shell" + (drawerOpen ? " drawer-open" : "")}>
      {/* Tap-to-dismiss backdrop; only interactive on small screens. */}
      <div
        className="sidebar-backdrop"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside className="sidebar" id="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            AP
          </div>
          <div>
            <div className="brand-name">Admin Portal</div>
            <div className="brand-sub">Console</div>
          </div>
        </div>

        <nav className="nav" aria-label="Modules">
          {groupedModules(nav).map((group) => (
            <div
              key={group.key}
              className="nav-group"
              role="group"
              aria-labelledby={`nav-cat-${group.key}`}
            >
              <div className="nav-section" id={`nav-cat-${group.key}`}>
                {group.label}
              </div>
              {group.modules.map((m) => {
                const active =
                  pathname === m.path || pathname.startsWith(m.path + "/");
                return (
                  <Link
                    key={m.key}
                    href={m.path}
                    className={"nav-link" + (active ? " active" : "")}
                    aria-current={active ? "page" : undefined}
                    // Dismiss the drawer on navigation, otherwise the new page
                    // renders behind it on a phone.
                    onClick={() => setDrawerOpen(false)}
                  >
                    <span className="nav-ico" aria-hidden="true">
                      <Icon name={m.icon} size={18} />
                    </span>
                    <span className="nav-label">{m.label}</span>
                    <NavPending />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip" style={{ marginBottom: 10 }}>
            <Avatar src={user.photo_url} name={user.full_name} size={36} />
            <div className="user-chip-text">
              <div className="um-name">{user.full_name}</div>
              <div className="um-role">{user.role?.name ?? "No role"}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={signOut}
            disabled={signingOut}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <Icon name="signOut" size={16} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="drawer-toggle"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
          >
            <Icon name="menu" size={18} />
          </button>
          <h1>{title}</h1>
          <div className="topbar-right">
            <ThemeToggle compact />
            <span className="topbar-identity">{user.email ?? user.mobile}</span>
            <Avatar src={user.photo_url} name={user.full_name} size={32} />
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
