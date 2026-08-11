"use client";

import Avatar from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/icons";
import type { DashboardStats } from "@/lib/types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

type StatCardProps = {
  label: string;
  value: number | string;
  sub?: string;
  icon: IconName;
  tone: "indigo" | "green" | "amber" | "blue";
};

function StatCard({ label, value, sub, icon, tone }: StatCardProps) {
  return (
    <div className="stat">
      <div className="label">
        <span className={"stat-ico " + tone} aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        {label}
      </div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

type DashboardClientProps = {
  userName: string;
  stats: DashboardStats;
};

export function DashboardClient({ userName, stats }: DashboardClientProps) {
  return (
    <div>
      <div className="page-head">
        <div>
          <h2 className="page-title">Welcome back, {userName.split(" ")[0]}</h2>
          <p>An overview of the accounts and access groups in this portal.</p>
        </div>
      </div>

      <div className="grid cols-4">
        <StatCard
          label="Total users"
          value={stats.totalUsers}
          sub="Admin accounts"
          icon="users"
          tone="indigo"
        />
        <StatCard
          label="Active"
          value={stats.activeUsers}
          sub="Can sign in"
          icon="check"
          tone="green"
        />
        <StatCard
          label="Disabled"
          value={stats.disabledUsers}
          sub="Sign-in blocked"
          icon="ban"
          tone="amber"
        />
        <StatCard
          label="Access groups"
          value={stats.totalRoles}
          sub={`${stats.superRoles} with full access`}
          icon="shield"
          tone="blue"
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="card-title">Recently added users</div>
          <span className="badge gray">{stats.recentUsers.length} shown</span>
        </div>

        {stats.recentUsers.length === 0 ? (
          <div className="empty-state">
            <div className="big" aria-hidden="true">
              <Icon name="user" size={28} />
            </div>
            No users yet.
          </div>
        ) : (
          <div className="table-wrap table-cards">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map((user) => (
                  <tr key={user.id}>
                    <td data-label="User">
                      <div className="user-chip">
                        <Avatar
                          src={user.photo_url}
                          name={user.full_name}
                          size={32}
                        />
                        <div className="user-chip-text">
                          <div className="um-name">{user.full_name}</div>
                          <div className="um-role">
                            {user.email ?? user.mobile ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role">
                      {user.role_name ? (
                        <span className="badge indigo">{user.role_name}</span>
                      ) : (
                        <span className="badge gray">No role</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <span
                        className={
                          "badge " + (user.status === "active" ? "green" : "red")
                        }
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="muted" data-label="Added">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
