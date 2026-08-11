"use client";

import { useCallback, useState } from "react";
import Field from "@/components/ui/Field";
import { Icon } from "@/components/icons";
import Modal from "@/components/ui/Modal";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
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
  const [deleting, setDeleting] = useState(false);

  const { reportError } = useErrorDialog();
  const { showToast } = useToast();
  const roleForm = useFormErrors("role-form");

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ roles: RoleSummary[] }>("/api/roles");
      setRoles(data.roles);
    } catch (err) {
      reportError(err, "Could not refresh groups");
    }
  }, [reportError]);

  function closeForm() {
    setForm(null);
    roleForm.reset();
  }

  function openEdit(role: RoleSummary) {
    roleForm.reset();
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

    const parsed = roleForm.validate(roleInputSchema, {
      name: form.name,
      description: form.description,
      modules: form.modules,
    });
    if (!parsed) return;

    setSaving(true);
    try {
      if (isEdit) {
        await apiJson(`/api/roles/${form.id}`, "PUT", parsed);
      } else {
        await apiJson("/api/roles", "POST", parsed);
      }
      closeForm();
      showToast(isEdit ? "Group updated." : "Group created.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not save group");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiJson(`/api/roles/${confirmDelete.id}`, "DELETE");
      setConfirmDelete(null);
      showToast("Group deleted.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not delete group");
    } finally {
      setDeleting(false);
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
          <h2 className="page-title">Role Management</h2>
          <p>Create a group and select the modules it can access.</p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            roleForm.reset();
            setForm({ ...EMPTY_FORM });
          }}
        >
          <Icon name="plus" size={15} /> Create group
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="empty-state">
          <div className="big" aria-hidden="true">
            <Icon name="shield" size={28} />
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
                  <div className="meta" style={{ marginTop: 2 }}>
                    {role.description ?? "No description"}
                  </div>
                </div>
                <span className="badge gray">{role.user_count} user(s)</span>
              </div>

              <div className="list-inline" style={{ marginBottom: 16 }}>
                {moduleLabels(role).length === 0 ? (
                  <span className="meta">
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
          onClose={closeForm}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={closeForm}>
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
          <Field
            formId="role-form"
            name="name"
            label="Group name"
            required
            error={roleForm.errors.name}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={form.name}
                onChange={(event) => {
                  setForm({ ...form, name: event.target.value });
                  roleForm.clearField("name");
                }}
                placeholder="e.g. Support Team"
              />
            )}
          </Field>
          <Field
            formId="role-form"
            name="description"
            label="Description"
            error={roleForm.errors.description}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={form.description}
                onChange={(event) => {
                  setForm({ ...form, description: event.target.value });
                  roleForm.clearField("description");
                }}
                placeholder="What can this group do?"
              />
            )}
          </Field>

          {/* Not a Field: a checkbox grid has no single control for htmlFor to
              point at, so the label and any error are rendered directly. */}
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
                          <Icon name={module.icon} size={16} />
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
                {roleForm.errors.modules && (
                  <div className="field-error">{roleForm.errors.modules}</div>
                )}
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
              <button
                type="button"
                className="btn danger"
                onClick={doDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete group"}
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
