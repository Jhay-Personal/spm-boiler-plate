"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import Modal from "@/components/Modal";
import PhotoUploader from "@/components/PhotoUploader";

const EMPTY = {
  id: null,
  full_name: "",
  email: "",
  mobile: "",
  password: "",
  role_id: "",
  photo_url: "",
  status: "active",
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [form, setForm] = useState(null); // user being added/edited
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [resetFor, setResetFor] = useState(null); // user for password reset
  const [newPw, setNewPw] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    const [u, r] = await Promise.all([
      fetch("/api/users").then((x) => x.json()),
      fetch("/api/roles").then((x) => x.json()),
    ]);
    setUsers(u.users || []);
    setRoles(r.roles || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setError("");
    setForm({ ...EMPTY });
  }
  function openEdit(u) {
    setError("");
    setForm({
      id: u.id,
      full_name: u.full_name || "",
      email: u.email || "",
      mobile: u.mobile || "",
      password: "",
      role_id: u.role_id || "",
      photo_url: u.photo_url || "",
      status: u.status || "active",
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    const isEdit = Boolean(form.id);
    const payload = {
      full_name: form.full_name,
      email: form.email,
      mobile: form.mobile,
      role_id: form.role_id || null,
      photo_url: form.photo_url,
      status: form.status,
    };
    if (!isEdit) payload.password = form.password;

    const res = await fetch(isEdit ? `/api/users/${form.id}` : "/api/users", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save.");
      return;
    }
    setForm(null);
    setFlash(isEdit ? "User updated." : "User created.");
    load();
  }

  async function doReset() {
    setError("");
    const res = await fetch(`/api/users/${resetFor.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPw }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not reset password.");
      return;
    }
    setResetFor(null);
    setNewPw("");
    setFlash("Password reset.");
  }

  async function remove(u) {
    if (!confirm(`Delete ${u.full_name}? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setFlash("");
      alert(data.error || "Could not delete.");
      return;
    }
    setFlash("User deleted.");
    load();
  }

  const filtered = users.filter((u) => {
    const s = q.toLowerCase();
    return (
      !s ||
      (u.full_name || "").toLowerCase().includes(s) ||
      (u.email || "").toLowerCase().includes(s) ||
      (u.mobile || "").toLowerCase().includes(s)
    );
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>User Management</h2>
          <p>Create login accounts, assign roles, and reset passwords.</p>
        </div>
        <button className="btn primary" onClick={openAdd}>
          ＋ Add user
        </button>
      </div>

      {flash && (
        <div className="alert success" onAnimationEnd={() => setFlash("")}>
          {flash}
        </div>
      )}

      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search by name, email or mobile…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="spacer" />
        <span className="muted">{filtered.length} user(s)</span>
      </div>

      {loading ? (
        <div className="muted">Loading users…</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="big">👥</div>
                      No users found.
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-chip">
                      <Avatar src={u.photo_url} name={u.full_name} size={34} />
                      <div>
                        <div className="um-name">{u.full_name}</div>
                        <div className="um-role">ID #{u.id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{u.email || <span className="muted">—</span>}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {u.mobile || ""}
                    </div>
                  </td>
                  <td>
                    {u.role_name ? (
                      <span className="badge indigo">{u.role_name}</span>
                    ) : (
                      <span className="badge gray">No role</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={"badge " + (u.status === "active" ? "green" : "red")}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td>
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() => openEdit(u)}>
                        Edit
                      </button>
                      <button
                        className="btn sm"
                        onClick={() => {
                          setResetFor(u);
                          setNewPw("");
                          setError("");
                        }}
                      >
                        Reset password
                      </button>
                      <button className="btn sm danger" onClick={() => remove(u)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit modal */}
      {form && (
        <Modal
          title={form.id ? "Edit user" : "Add user"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save changes" : "Create user"}
              </button>
            </>
          }
        >
          {error && <div className="alert error">{error}</div>}

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
              placeholder="Jane Dela Cruz"
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@email.com"
              />
            </div>
            <div className="field">
              <label>Mobile number</label>
              <input
                type="tel"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="09XXXXXXXXX"
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Role group</label>
              <select
                value={form.role_id || ""}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
              >
                <option value="">— No role —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>

          {!form.id && (
            <div className="field">
              <label>Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 6 characters"
              />
              <div className="hint">
                The user signs in with their email or mobile plus this password.
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Reset password modal */}
      {resetFor && (
        <Modal
          title={`Reset password — ${resetFor.full_name}`}
          onClose={() => setResetFor(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setResetFor(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={doReset}>
                Set new password
              </button>
            </>
          }
        >
          {error && <div className="alert error">{error}</div>}
          <div className="field">
            <label>New password</label>
            <input
              type="text"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="At least 6 characters"
            />
            <div className="hint">
              Share this with the user securely; they can change it later from
              their profile.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
