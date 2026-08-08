"use client";

import { useEffect, useState } from "react";

const STATUS_META = {
  posted: { cls: "green", label: "Posted" },
  pending: { cls: "amber", label: "Pending" },
  failed: { cls: "red", label: "Failed" },
  skipped: { cls: "gray", label: "Skipped" },
};

function num(n) {
  return Number(n || 0).toLocaleString();
}

function timeAgo(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="muted">Loading dashboard…</div>;
  if (!data) return <div className="alert error">Could not load dashboard.</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>Pipeline overview</h2>
          <p>Live figures from the 2ni viral content pipeline.</p>
        </div>
      </div>

      {!data.pipelineReady && (
        <div className="alert info">
          Pipeline tables are empty or not yet populated. Once your n8n workflow
          starts ingesting posts into <code>viral_posts</code> and{" "}
          <code>generated_content</code>, the numbers here fill in automatically.
        </div>
      )}

      <div className="grid cols-4">
        <div className="stat">
          <div className="label">
            <span className="stat-ico" style={{ background: "var(--info-soft)" }}>🔥</span>
            Viral posts scraped
          </div>
          <div className="value">{num(data.totalPosts)}</div>
          <div className="sub">{num(data.postsLast7)} in the last 7 days</div>
        </div>
        <div className="stat">
          <div className="label">
            <span className="stat-ico" style={{ background: "var(--primary-soft)" }}>✍️</span>
            Rewrites generated
          </div>
          <div className="value">{num(data.totalGenerated)}</div>
          <div className="sub">by Claude</div>
        </div>
        <div className="stat">
          <div className="label">
            <span className="stat-ico" style={{ background: "var(--success-soft)" }}>🚀</span>
            Published
          </div>
          <div className="value">{num(data.statusCounts.posted)}</div>
          <div className="sub">{data.publishRate}% publish rate</div>
        </div>
        <div className="stat">
          <div className="label">
            <span className="stat-ico" style={{ background: "var(--warning-soft)" }}>👥</span>
            Admin users
          </div>
          <div className="value">{num(data.userCount)}</div>
          <div className="sub">{num(data.roleCount)} role groups</div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Publishing status</div>
          </div>
          {Object.entries(data.statusCounts).map(([k, v]) => {
            const meta = STATUS_META[k] || { cls: "gray", label: k };
            const pct =
              data.totalGenerated > 0
                ? Math.round((v / data.totalGenerated) * 100)
                : 0;
            const color = {
              green: "var(--success)",
              amber: "var(--warning)",
              red: "var(--danger)",
              gray: "var(--muted)",
            }[meta.cls];
            return (
              <div key={k} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                    fontSize: 13,
                  }}
                >
                  <span>
                    <span className={"badge " + meta.cls}>{meta.label}</span>
                  </span>
                  <span className="muted">
                    {num(v)} · {pct}%
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: pct + "%", background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Top source pages</div>
          </div>
          {data.topPages.length === 0 ? (
            <div className="muted">No posts yet.</div>
          ) : (
            data.topPages.map((p, i) => (
              <div className="kv" key={i}>
                <span className="k">{p.page_name}</span>
                <span>
                  {num(p.posts)} posts · {num(p.likes)} likes
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="card-title">Recent rewrites</div>
        </div>
        {data.recent.length === 0 ? (
          <div className="empty-state">
            <div className="big">📭</div>
            No generated content yet.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Caption</th>
                  <th>Source page</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => {
                  const meta = STATUS_META[r.status] || {
                    cls: "gray",
                    label: r.status,
                  };
                  return (
                    <tr key={r.id}>
                      <td style={{ maxWidth: 340 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.ai_generated_caption || "—"}
                        </div>
                      </td>
                      <td>{r.page_name || "—"}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {r.model_used || "—"}
                      </td>
                      <td>
                        <span className={"badge " + meta.cls}>{meta.label}</span>
                      </td>
                      <td className="muted">{timeAgo(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
