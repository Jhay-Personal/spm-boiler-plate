"use client";

import { useEffect, useState } from "react";

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

const STATUS = {
  posted: "green",
  pending: "amber",
  failed: "red",
  skipped: "gray",
};

const FILTERS = ["all", "posted", "pending", "failed", "skipped"];

export default function GeneratedContentPage() {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  async function load(status = "all") {
    setLoading(true);
    const url =
      status && status !== "all"
        ? `/api/generated-content?status=${status}`
        : "/api/generated-content";
    const d = await fetch(url).then((r) => r.json());
    setItems(d.items || []);
    setReady(d.pipelineReady);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function pick(f) {
    setFilter(f);
    load(f);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>Generated Content</h2>
          <p>Claude rewrites and their publishing status.</p>
        </div>
      </div>

      {!ready && (
        <div className="alert info">
          The <code>generated_content</code> table has no data yet.
        </div>
      )}

      <div className="toolbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={"btn sm" + (filter === f ? " primary" : "")}
            onClick={() => pick(f)}
            style={{ textTransform: "capitalize" }}
          >
            {f}
          </button>
        ))}
        <div className="spacer" />
        <span className="muted">{items.length} item(s)</span>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rewritten caption</th>
                <th>Source page</th>
                <th>Model</th>
                <th>Status</th>
                <th>Posted</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="big">✍️</div>
                      No generated content{filter !== "all" ? ` (${filter})` : ""}.
                    </div>
                  </td>
                </tr>
              )}
              {items.map((g) => (
                <tr key={g.id}>
                  <td style={{ maxWidth: 380 }}>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g.ai_generated_caption || "—"}
                    </div>
                  </td>
                  <td>{g.page_name || "—"}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {g.model_used || "—"}
                  </td>
                  <td>
                    <span className={"badge " + (STATUS[g.status] || "gray")}>
                      {g.status}
                    </span>
                  </td>
                  <td className="muted">{fmtDate(g.posted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
