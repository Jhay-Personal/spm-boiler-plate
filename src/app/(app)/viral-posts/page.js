"use client";

import { useEffect, useState } from "react";

function num(n) {
  return Number(n || 0).toLocaleString();
}
function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

const MEDIA = {
  photo: "blue",
  video: "indigo",
  text: "gray",
};

export default function ViralPostsPage() {
  const [posts, setPosts] = useState([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load(query = "") {
    setLoading(true);
    const url = query
      ? `/api/viral-posts?q=${encodeURIComponent(query)}`
      : "/api/viral-posts";
    const d = await fetch(url).then((r) => r.json());
    setPosts(d.posts || []);
    setReady(d.pipelineReady);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>Viral Posts</h2>
          <p>Source posts discovered by the Apify scraper.</p>
        </div>
      </div>

      {!ready && (
        <div className="alert info">
          The <code>viral_posts</code> table has no data yet.
        </div>
      )}

      <div className="toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(q);
          }}
          style={{ display: "flex", gap: 10, flex: 1 }}
        >
          <input
            className="search"
            type="search"
            placeholder="Search caption or page…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
        <span className="muted">{posts.length} post(s)</span>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Caption</th>
                <th>Page</th>
                <th>Type</th>
                <th style={{ textAlign: "right" }}>Likes</th>
                <th style={{ textAlign: "right" }}>Shares</th>
                <th>Scraped</th>
              </tr>
            </thead>
            <tbody>
              {posts.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="big">🔥</div>
                      No posts yet.
                    </div>
                  </td>
                </tr>
              )}
              {posts.map((p) => (
                <tr key={p.id}>
                  <td style={{ maxWidth: 360 }}>
                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.post_url ? (
                        <a
                          className="link"
                          href={p.post_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {p.caption || "(no caption)"}
                        </a>
                      ) : (
                        p.caption || "(no caption)"
                      )}
                    </div>
                  </td>
                  <td>{p.page_name || "—"}</td>
                  <td>
                    <span className={"badge " + (MEDIA[p.media_type] || "gray")}>
                      {p.media_type || "text"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>{num(p.likes_count)}</td>
                  <td style={{ textAlign: "right" }}>{num(p.shares_count)}</td>
                  <td className="muted">{fmtDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
