"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PhotoUploader from "@/components/PhotoUploader";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        setForm({
          full_name: d.user.full_name || "",
          email: d.user.email || "",
          mobile: d.user.mobile || "",
          photo_url: d.user.photo_url || "",
        });
      });
  }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    setFlash("");

    const payload = { ...form };
    const wantsPw = pw.new_password || pw.current_password;
    if (wantsPw) {
      if (pw.new_password !== pw.confirm) {
        setError("New password and confirmation do not match.");
        return;
      }
      payload.current_password = pw.current_password;
      payload.new_password = pw.new_password;
    }

    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save.");
      return;
    }
    setPw({ current_password: "", new_password: "", confirm: "" });
    setFlash("Profile saved.");
    router.refresh(); // update sidebar name/photo
  }

  if (!form) return <div className="muted">Loading profile…</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>Profile Management</h2>
          <p>Update your own details, photo, and password.</p>
        </div>
        {user?.role && <span className="badge indigo">{user.role.name}</span>}
      </div>

      {flash && <div className="alert success">{flash}</div>}
      {error && <div className="alert error">{error}</div>}

      <form onSubmit={save}>
        <div className="grid cols-2">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>
              Basic information
            </div>

            <div className="field">
              <label>Profile photo</label>
              <PhotoUploader
                value={form.photo_url}
                name={form.full_name}
                onChange={(url) => setForm({ ...form, photo_url: url })}
              />
            </div>

            <div className="divider" />

            <div className="field">
              <label>Full name *</label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Mobile number</label>
              <input
                type="tel"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>
              Change password
            </div>
            <div className="field">
              <label>Current password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={pw.current_password}
                onChange={(e) =>
                  setPw({ ...pw, current_password: e.target.value })
                }
                placeholder="Leave blank to keep current"
              />
            </div>
            <div className="field">
              <label>New password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pw.new_password}
                onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </div>
            <div className="hint">
              Only fill these in if you want to change your password.
            </div>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
