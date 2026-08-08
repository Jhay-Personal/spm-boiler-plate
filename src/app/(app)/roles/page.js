"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { MODULES } from "@/lib/modules";

const EMPTY = { id: null, name: "", description: "", modules: [], is_super: false };

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    setLoading(true);
    const r = await fetch("/api/roles").then((x) => x.json());
    setRoles(r.roles || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setError("");
    setForm({ ...EMPTY, modules: [] });
  }
  function openEdit(r) {
    setError("");
    setForm({
      id: r.id,
      name: r.name,
      description: r.description || "",
      modules: Array.isArray(r.modules) ? r.modules : [],
      is_super: r.is_super,
    });
  }

  function toggleModule(key) {
    setForm((f) => {
      const has = f.modules.includes(key);
      return {
        ...f,
        modules: has
          ? f.modules.filter((m) => m !== key)
          : [...f.modules, key],
      };
    });
  }

  async function save() {
    setSaving(true);
    setError("");
    const isEdit = Boolean(form.id);
    const res = await fetch(isEdit ? `/api/roles/${form.id}` : "/api/roles", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        modules: form.modules,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save.");
      return;
    }
    setForm(null);
    setFlash(isEdit ? "Group updated." : "Group created.");
    load();
  }

  async function remove(r) {
    if (!confirm(`Delete the "${r.name}" group?`)) return;
    const res = await fetch(`/api/roles/${r.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not delete.");
      return;
    }
    setFlash("Group deleted.");
    load();
  }

  function moduleLabels(r) {
    if (r.is_super) return ["All modules"];
    const keys = Array.isArray(r.modules) ? r.modules : [];
    return keys.map((k) => MODULES.find((m) => m.key === k)?.label || k);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>Role Management</h2>
          <p>Create a group and select the list of modules it can access.</p>
        </div>
        <button className="btn primary" onClick={openAdd}>
          ＋ Create group
        </button>
      </div>

      {flash && <div className="alert success">{flash}</div>}

      {loading ? (
        <div className="muted">Loading groups…</div>
      ) : (
        <div className="grid cols-2">
          {roles.map((r) => (
            <div className="card" key={r.id}>
              <div className="card-head">
                <div>
                  <div className="card-title">
                    {r.name}{" "}
                    {r.is_super && <span className="badge indigo">Super</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {r.description || "No description"}
                  </div>
                </div>
                <span className="badge gray">{r.user_count} user(s)</span>
              </div>

              <div className="list-inline" style={{ marginBottom: 16 }}>
                {moduleLabels(r).length === 0 ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    No modules selected
                  </span>
                ) : (
                  moduleLabels(r).map((m, i) => (
                    <span className="badge blue" key={i}>
                      {m}
                    </span>
                  ))
                )}
              </div>

              <div className="btn-row">
                <button className="btn sm" onClick={() => openEdit(r)}>
                  Edit
                </button>
                {!r.is_super && (
                  <button className="btn sm danger" onClick={() => remove(r)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal
          wide
          title={form.id ? "Edit group" : "Create group"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save changes" : "Create group"}
              </button>
            </>
          }
        >
          {error && <div className="alert error">{error}</div>}

          <div className="field">
            <label>Group name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Content Manager"
            />
          </div>
          <div className="field">
            <label>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What can this group do?"
            />
          </div>

          <div className="field">
            <label>Modules</label>
            {form.is_super ? (
              <div className="alert info">
                The Super Admin group always has access to every module. You can
                rename it but its module list is fixed.
              </div>
            ) : (
              <>
                <div className="check-grid">
                  {MODULES.map((m) => {
                    const on = form.modules.includes(m.key);
                    return (
                      <label
                        key={m.key}
                        className={"check-item" + (on ? " on" : "")}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleModule(m.key)}
                        />
                        <span className="nav-ico">{m.icon}</span>
                        <span>
                          <span className="ci-label">{m.label}</span>
                          <br />
                          <span className="ci-key">{m.key}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="hint">
                  Profile Management is always available to every signed-in user.
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
