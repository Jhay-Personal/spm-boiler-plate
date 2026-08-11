"use client";

import { useCallback, useMemo, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Field from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import PhotoUploader from "@/components/ui/PhotoUploader";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
import { apiFetch, apiJson } from "@/lib/api-client";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation";
import type { RoleSummary, UserStatus, UserSummary } from "@/lib/types";
import { createUserSchema, updateUserSchema } from "./schema";

type FormState = {
  id: number | null;
  full_name: string;
  email: string;
  mobile: string;
  password: string;
  role_id: string;
  photo_url: string | null;
  status: UserStatus;
};

const EMPTY_FORM: FormState = {
  id: null,
  full_name: "",
  email: "",
  mobile: "",
  password: "",
  role_id: "",
  photo_url: null,
  status: "active",
};

type UsersClientProps = {
  initialUsers: UserSummary[];
  roles: RoleSummary[];
  canManagePrivileges: boolean;
  currentUserId: number;
};

export function UsersClient({
  initialUsers,
  roles,
  canManagePrivileges,
  currentUserId,
}: UsersClientProps) {
  // Seeded from the server render — no loading state and no fetch-on-mount
  // effect. Refreshes happen only in response to a mutation the user made.
  const [users, setUsers] = useState<UserSummary[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<UserSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<UserSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Failures keep the modal; field validation is inline.
  const { reportError } = useErrorDialog();
  const { showToast } = useToast();
  // Two instances because the two dialogs are separate forms with separate ids.
  const userForm = useFormErrors("user-form");
  const resetForm = useFormErrors("reset-form");

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: UserSummary[] }>("/api/users");
      setUsers(data.users);
    } catch (err) {
      reportError(err, "Could not refresh users");
    }
  }, [reportError]);

  function openAdd() {
    userForm.reset();
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(user: UserSummary) {
    userForm.reset();
    setForm({
      id: user.id,
      full_name: user.full_name,
      email: user.email ?? "",
      mobile: user.mobile ?? "",
      password: "",
      role_id: user.role_id === null ? "" : String(user.role_id),
      photo_url: user.photo_url,
      status: user.status,
    });
  }

  function closeForm() {
    setForm(null);
    userForm.reset();
  }

  function closeReset() {
    setResetFor(null);
    setNewPassword("");
    resetForm.reset();
  }

  async function save() {
    if (!form) return;
    const isEdit = form.id !== null;

    const base = {
      full_name: form.full_name,
      email: form.email,
      mobile: form.mobile,
      photo_url: form.photo_url ?? "",
    };

    // Validated with the very same schema the server uses, and every failing
    // field is reported at once rather than one per submit.
    const parsed = isEdit
      ? userForm.validate(updateUserSchema, base)
      : userForm.validate(createUserSchema, {
          ...base,
          password: form.password,
          role_id: form.role_id,
        });

    if (!parsed) return;

    // role_id / status travel alongside, and are honoured only for super admins.
    const payload: Record<string, unknown> = { ...parsed };
    if (canManagePrivileges && isEdit) {
      payload.role_id = form.role_id === "" ? null : Number(form.role_id);
      if (form.id !== currentUserId) payload.status = form.status;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await apiJson(`/api/users/${form.id}`, "PUT", payload);
      } else {
        await apiJson("/api/users", "POST", payload);
      }
      closeForm();
      showToast(isEdit ? "User updated." : "User created.");
      await refresh();
    } catch (err) {
      // A failure from the server keeps the modal — a permission denial or a
      // duplicate email is not something a field outline can express.
      reportError(err, isEdit ? "Could not save user" : "Could not create user");
    } finally {
      setSaving(false);
    }
  }

  async function doReset() {
    if (!resetFor) return;
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      resetForm.setFieldError(
        "password",
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    try {
      await apiJson(`/api/users/${resetFor.id}/reset-password`, "POST", {
        password: newPassword,
      });
      closeReset();
      showToast("Password reset. That user's other sessions were signed out.");
    } catch (err) {
      reportError(err, "Could not reset password");
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiJson(`/api/users/${confirmDelete.id}`, "DELETE");
      setConfirmDelete(null);
      showToast("User deleted.");
      await refresh();
    } catch (err) {
      reportError(err, "Could not delete user");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [user.full_name, user.email, user.mobile]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    );
  }, [users, search]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>User Management</h2>
          <p>Create sign-in accounts, assign roles, and reset passwords.</p>
        </div>
        <button type="button" className="btn primary" onClick={openAdd}>
          ＋ Add user
        </button>
      </div>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          aria-label="Search users"
          placeholder="Search by name, email or mobile…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="spacer" />
        <span className="muted">{filtered.length} user(s)</span>
      </div>

      <div className="table-wrap table-cards">
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
                  <td colSpan={5} className="cell-empty">
                    <div className="empty-state">
                      <div className="big" aria-hidden="true">
                        👥
                      </div>
                      No users found.
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td data-label="User">
                    <div className="user-chip">
                      <Avatar
                        src={user.photo_url}
                        name={user.full_name}
                        size={34}
                      />
                      <div>
                        <div className="um-name">{user.full_name}</div>
                        <div className="um-role">ID #{user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Contact">
                    <div>{user.email ?? <span className="muted">—</span>}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {user.mobile ?? ""}
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
                  <td className="cell-actions">
                    <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => openEdit(user)}
                      >
                        Edit
                      </button>
                      {canManagePrivileges && (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => {
                            resetForm.reset();
                            setResetFor(user);
                            setNewPassword("");
                          }}
                        >
                          Reset password
                        </button>
                      )}
                      {user.id !== currentUserId && (
                        <button
                          type="button"
                          className="btn sm danger"
                          onClick={() => setConfirmDelete(user)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal
          title={form.id ? "Edit user" : "Add user"}
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
                {saving ? "Saving…" : form.id ? "Save changes" : "Create user"}
              </button>
            </>
          }
        >
          {/* Not a Field: PhotoUploader is not a single labelled control and
              carries no validation state of its own. */}
          <div className="field">
            <label>Profile photo</label>
            <PhotoUploader
              value={form.photo_url}
              name={form.full_name}
              onChange={(url) => setForm({ ...form, photo_url: url })}
            />
          </div>

          <div className="divider" />

          <Field
            formId="user-form"
            name="full_name"
            label="Full name"
            required
            error={userForm.errors.full_name}
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={form.full_name}
                onChange={(event) => {
                  setForm({ ...form, full_name: event.target.value });
                  userForm.clearField("full_name");
                }}
                placeholder="Jane Dela Cruz"
              />
            )}
          </Field>

          <div className="form-grid">
            <Field
              formId="user-form"
              name="email"
              label="Email"
              error={userForm.errors.email}
            >
              {(control) => (
                <input
                  {...control}
                  type="email"
                  value={form.email}
                  onChange={(event) => {
                    setForm({ ...form, email: event.target.value });
                    userForm.clearField("email");
                  }}
                  placeholder="jane@email.com"
                />
              )}
            </Field>
            <Field
              formId="user-form"
              name="mobile"
              label="Mobile number"
              error={userForm.errors.mobile}
            >
              {(control) => (
                <input
                  {...control}
                  type="tel"
                  value={form.mobile}
                  onChange={(event) => {
                    setForm({ ...form, mobile: event.target.value });
                    userForm.clearField("mobile");
                  }}
                  placeholder="09XXXXXXXXX"
                />
              )}
            </Field>
          </div>

          {canManagePrivileges ? (
            <div className="form-grid">
              <Field
                formId="user-form"
                name="role_id"
                label="Role group"
                error={userForm.errors.role_id}
              >
                {(control) => (
                  <select
                    {...control}
                    value={form.role_id}
                    onChange={(event) => {
                      setForm({ ...form, role_id: event.target.value });
                      userForm.clearField("role_id");
                    }}
                  >
                    <option value="">— No role —</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                formId="user-form"
                name="status"
                label="Status"
                error={userForm.errors.status}
                hint={
                  form.id === currentUserId
                    ? "You cannot change your own role or status."
                    : undefined
                }
              >
                {(control) => (
                  <select
                    {...control}
                    value={form.status}
                    disabled={form.id === currentUserId}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as UserStatus,
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                )}
              </Field>
            </div>
          ) : (
            <div className="alert info">
              Only a super admin can assign roles or change account status.
            </div>
          )}

          {!form.id && (
            <Field
              formId="user-form"
              name="password"
              label="Password"
              required
              error={userForm.errors.password}
              hint="The user signs in with their email or mobile plus this password."
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => {
                    setForm({ ...form, password: event.target.value });
                    userForm.clearField("password");
                  }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
              )}
            </Field>
          )}
        </Modal>
      )}

      {resetFor && (
        <Modal
          title={`Reset password — ${resetFor.full_name}`}
          onClose={closeReset}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={closeReset}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={doReset}>
                Set new password
              </button>
            </>
          }
        >
          <Field
            formId="reset-form"
            name="password"
            label="New password"
            error={resetForm.errors.password}
            hint="Share this securely. All of that user's existing sessions are signed out, and they can change it from their profile."
          >
            {(control) => (
              <input
                {...control}
                type="text"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  resetForm.clearField("password");
                }}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            )}
          </Field>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          tone="danger"
          title="Delete user"
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
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </>
          }
        >
          <p className="modal-message">
            Delete <strong>{confirmDelete.full_name}</strong>? This cannot be
            undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
