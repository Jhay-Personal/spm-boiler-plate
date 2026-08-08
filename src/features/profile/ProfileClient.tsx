"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoUploader from "@/components/ui/PhotoUploader";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { apiJson } from "@/lib/api-client";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation";
import type { CurrentUser } from "@/lib/types";
import { updateProfileSchema } from "./schema";

export function ProfileClient({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const { showError, reportError } = useErrorDialog();

  const [form, setForm] = useState({
    full_name: user.full_name,
    email: user.email ?? "",
    mobile: user.mobile ?? "",
    photo_url: user.photo_url,
  });
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash("");

    const wantsPasswordChange = Boolean(
      passwords.new_password || passwords.current_password,
    );

    if (wantsPasswordChange && passwords.new_password !== passwords.confirm) {
      showError(
        "The new password and its confirmation do not match.",
        "Could not save profile",
      );
      return;
    }

    const parsed = updateProfileSchema.safeParse({
      full_name: form.full_name,
      email: form.email,
      mobile: form.mobile,
      photo_url: form.photo_url ?? "",
      ...(wantsPasswordChange
        ? {
            current_password: passwords.current_password,
            new_password: passwords.new_password,
          }
        : {}),
    });

    if (!parsed.success) {
      showError(
        parsed.error.issues[0]?.message ?? "Check the form and try again.",
        "Could not save profile",
      );
      return;
    }

    setSaving(true);
    try {
      await apiJson("/api/profile", "PUT", parsed.data);
      setPasswords({ current_password: "", new_password: "", confirm: "" });
      setFlash(
        wantsPasswordChange
          ? "Profile saved. Your other sessions were signed out."
          : "Profile saved.",
      );
      // Refresh so the sidebar picks up the new name and photo.
      router.refresh();
    } catch (err) {
      reportError(err, "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2 style={{ fontSize: 20 }}>Profile Management</h2>
          <p>Update your own details, photo, and password.</p>
        </div>
        {user.role && <span className="badge indigo">{user.role.name}</span>}
      </div>

      {flash && (
        <div className="alert success" role="status">
          {flash}
        </div>
      )}

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
              <label htmlFor="profile-name">Full name *</label>
              <input
                id="profile-name"
                type="text"
                value={form.full_name}
                onChange={(event) =>
                  setForm({ ...form, full_name: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="profile-mobile">Mobile number</label>
              <input
                id="profile-mobile"
                type="tel"
                value={form.mobile}
                onChange={(event) =>
                  setForm({ ...form, mobile: event.target.value })
                }
              />
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>
              Change password
            </div>
            <div className="field">
              <label htmlFor="profile-current">Current password</label>
              <input
                id="profile-current"
                type="password"
                autoComplete="current-password"
                value={passwords.current_password}
                onChange={(event) =>
                  setPasswords({
                    ...passwords,
                    current_password: event.target.value,
                  })
                }
                placeholder="Leave blank to keep current"
              />
            </div>
            <div className="field">
              <label htmlFor="profile-new">New password</label>
              <input
                id="profile-new"
                type="password"
                autoComplete="new-password"
                value={passwords.new_password}
                onChange={(event) =>
                  setPasswords({ ...passwords, new_password: event.target.value })
                }
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            </div>
            <div className="field">
              <label htmlFor="profile-confirm">Confirm new password</label>
              <input
                id="profile-confirm"
                type="password"
                autoComplete="new-password"
                value={passwords.confirm}
                onChange={(event) =>
                  setPasswords({ ...passwords, confirm: event.target.value })
                }
              />
            </div>
            <div className="hint">
              Only fill these in to change your password. Doing so signs out your
              other browsers.
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
