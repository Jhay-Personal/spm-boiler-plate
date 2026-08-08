"use client";

import { useCallback, useState } from "react";
import Modal from "@/components/ui/Modal";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { apiFetch, apiJson } from "@/lib/api-client";
import { MODULES, type ModuleKey } from "@/lib/modules";
import type { RoleSummary } from "@/lib/types";
import { roleInputSchema } from "./schema";

type FormState = {
  id: number | null;
  name: string;
  description: string;
  modules: ModuleKey[];
  is_super: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  description: "",
  modules: [],
  is_super: false,
};

export function RolesClient({ initialRoles }: { initialRoles: RoleSummary[] }) {
  // Seeded from the server render — no loading state and no fetch-on-mount
  // effect. Refreshes happen only in response to a mutation the user made.
  const [roles, setRoles] = useState<RoleSummary[]>(initialRoles);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RoleSummary | null>(null);
  const [flash, setFlash] = useState("");

  const { showError, reportError } = useErrorDialog();

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ roles: RoleSummary[] }>("/api/roles");
      setRoles(data.roles);
    } catch (err) {
      reportError(err, "Could not refresh groups");
    }
  }, [reportError]);

  function openEdit(role: RoleSummary) {
    setForm({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      modules: Array.isArray(role.modules) ? role.modules : [],
      is_super: role.is_super,
    });
  }

  function toggleModule(key: ModuleKey) {
    setForm((current) => {
      if (!current) return current;
      const has = current.modules.includes(key);
      return {
        ...current,
        modules: has
          ? current.modules.filter((m) => m !== key)
          : [...current.modules, key],
      };
    });
  }

  async function save() {
    if (!form) return;
    const isEdit = form.id !== null;

    const parsed = roleInputSchema.safeParse({
      name: form.name,
      description: form.description,
      modules: form.modules,
    });
    if (!parsed.success) {
      showError(
        parsed.error.issues[0]?.message ?? "Check the form and try again.",
        "Could not save group",
      );
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await apiJson(`/api/roles/${form.id}`, "PUT", parsed.data);
      } else {
        await apiJson("/api/roles", "POST", parsed.data);
      }
      setForm(null);
      setFlash(isEdit ? "Group updated." : "Group created.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not save group");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    try {
      await apiJson(`/api/roles/${confirmDelete.id}`, "DELETE");
      setConfirmDelete(null);
      setFlash("Group deleted.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not delete group");
    }
  }

  function moduleLabels(role: RoleSummary): string[] {
    if (role.is_super) return ["All modules"];
    const keys = Array.isArray(role.modules) ? role.modules : [];
    return keys.map((key) => MODULES.find((m) => m.key === key)?.label ?? key);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>Role Management</h2>
          <p>Create a group and select the modules it can access.</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setForm({ ...EMPTY_FORM })}
        >
          ＋ Create group
        </button>
      </div>

      {flash && (
        <div className="alert success" role="status">
          {flash}
        </div>
      )}

      {roles.length === 0 ? (
        <div className="empty-state">
          <div className="big" aria-hidden="true">
            🛡️
          </div>
          No groups yet.
        </div>
      ) : (
        <div className="grid cols-2">
          {roles.map((role) => (
            <div className="card" key={role.id}>
              <div className="card-head">
                <div>
                  <div className="card-title">
                    {role.name}{" "}
                    {role.is_super && <span className="badge indigo">Super</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {role.description ?? "No description"}
                  </div>
                </div>
                <span className="badge gray">{role.user_count} user(s)</span>
              </div>

              <div className="list-inline" style={{ marginBottom: 16 }}>
                {moduleLabels(role).length === 0 ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    No modules selected
                  </span>
                ) : (
                  moduleLabels(role).map((label) => (
                    <span className="badge blue" key={label}>
                      {label}
                    </span>
                  ))
                )}
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => openEdit(role)}
                >
                  Edit
                </button>
                {!role.is_super && (
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => setConfirmDelete(role)}
                  >
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
              <button
                type="button"
                className="btn ghost"
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={save}
                disabled={saving}
              >
                {saving ? "Saving…" : form.id ? "Save changes" : "Create group"}
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="role-name">Group name *</label>
            <input
              id="role-name"
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Support Team"
            />
          </div>
          <div className="field">
            <label htmlFor="role-description">Description</label>
            <input
              id="role-description"
              type="text"
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              placeholder="What can this group do?"
            />
          </div>

          <div className="field">
            <label>Modules</label>
            {form.is_super ? (
              <div className="alert info">
                The Super Admin group always has access to every module. You can
                rename it, but its module list is fixed.
              </div>
            ) : (
              <>
                <div className="check-grid">
                  {MODULES.map((module) => {
                    const on = form.modules.includes(module.key);
                    return (
                      <label
                        key={module.key}
                        className={"check-item" + (on ? " on" : "")}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleModule(module.key)}
                        />
                        <span className="nav-ico" aria-hidden="true">
                          {module.icon}
                        </span>
                        <span>
                          <span className="ci-label">{module.label}</span>
                          <br />
                          <span className="ci-key">{module.key}</span>
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

      {confirmDelete && (
        <Modal
          tone="danger"
          title="Delete group"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={doDelete}>
                Delete group
              </button>
            </>
          }
        >
          <p className="modal-message">
            Delete the <strong>{confirmDelete.name}</strong> group? Users
            assigned to it must be reassigned first.
          </p>
        </Modal>
      )}
    </div>
  );
}
