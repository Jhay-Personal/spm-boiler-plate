"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Avatar from "./Avatar";

export default function AppShell({ user, nav, children }) {
  const pathname = usePathname();
  const router = useRouter();

  const current =
    nav.find((m) => pathname === m.path || pathname.startsWith(m.path + "/")) ||
    null;
  const title = current ? current.label : "2ni Admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">2n</div>
          <div>
            <div className="brand-name">2ni Admin</div>
            <div className="brand-sub">Content Pipeline</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-section">Modules</div>
          {nav.map((m) => {
            const active =
              pathname === m.path || pathname.startsWith(m.path + "/");
            return (
              <Link
                key={m.key}
                href={m.path}
                className={"nav-link" + (active ? " active" : "")}
              >
                <span className="nav-ico">{m.icon}</span>
                <span>{m.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip" style={{ marginBottom: 10 }}>
            <Avatar src={user.photo_url} name={user.full_name} size={36} />
            <div>
              <div className="um-name">{user.full_name}</div>
              <div className="um-role">{user.role?.name || "No role"}</div>
            </div>
          </div>
          <button className="btn ghost sm" onClick={logout} style={{ width: "100%" }}>
            ⏻ Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="user-chip">
            <span className="um-role" style={{ fontSize: 12 }}>
              {user.email || user.mobile}
            </span>
            <Avatar src={user.photo_url} name={user.full_name} size={32} />
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
