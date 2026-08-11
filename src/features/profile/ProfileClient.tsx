"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/ui/Field";
import PhotoUploader from "@/components/ui/PhotoUploader";
import { useErrorDialog } from "@/components/ui/ErrorDialogProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { useFormErrors } from "@/features/forms/useFormErrors";
import { apiJson } from "@/lib/api-client";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation";
import type { CurrentUser } from "@/lib/types";
import { updateProfileSchema } from "./schema";

export function ProfileClient({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const { reportError } = useErrorDialog();
  const { showToast } = useToast();
  // One instance covers both cards — every field name below is distinct.
  const profileForm = useFormErrors("profile-form");

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

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const wantsPasswordChange = Boolean(
      passwords.new_password || passwords.current_password,
    );

    const parsed = profileForm.validate(updateProfileSchema, {
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

    if (!parsed) return;

    // Checked after validate(), not before: validate() clears the error map on
    // success, which would wipe a confirmation error set ahead of it. This rule
    // is not in updateProfileSchema because the server never receives `confirm`.
    if (wantsPasswordChange && passwords.new_password !== passwords.confirm) {
      profileForm.setFieldError(
        "confirm",
        "The new password and its confirmation do not match.",
      );
      return;
    }

    setSaving(true);
    try {
      await apiJson("/api/profile", "PUT", parsed);
      setPasswords({ current_password: "", new_password: "", confirm: "" });
      profileForm.reset();
      showToast(
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
          <h2 className="page-title">Profile Management</h2>
          <p>Update your own details, photo, and password.</p>
        </div>
        {user.role && <span className="badge indigo">{user.role.name}</span>}
      </div>

      <form onSubmit={save} noValidate>
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

            <Field
              formId="profile-form"
              name="full_name"
              label="Full name"
              required
              error={profileForm.errors.full_name}
            >
              {(control) => (
                <input
                  {...control}
                  type="text"
                  value={form.full_name}
                  onChange={(event) => {
                    setForm({ ...form, full_name: event.target.value });
                    profileForm.clearField("full_name");
                  }}
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="email"
              label="Email"
              error={profileForm.errors.email}
            >
              {(control) => (
                <input
                  {...control}
                  type="email"
                  value={form.email}
                  onChange={(event) => {
                    setForm({ ...form, email: event.target.value });
                    profileForm.clearField("email");
                  }}
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="mobile"
              label="Mobile number"
              error={profileForm.errors.mobile}
            >
              {(control) => (
                <input
                  {...control}
                  type="tel"
                  value={form.mobile}
                  onChange={(event) => {
                    setForm({ ...form, mobile: event.target.value });
                    profileForm.clearField("mobile");
                  }}
                />
              )}
            </Field>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>
              Change password
            </div>
            <Field
              formId="profile-form"
              name="current_password"
              label="Current password"
              error={profileForm.errors.current_password}
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current_password}
                  onChange={(event) => {
                    setPasswords({
                      ...passwords,
                      current_password: event.target.value,
                    });
                    profileForm.clearField("current_password");
                  }}
                  placeholder="Leave blank to keep current"
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="new_password"
              label="New password"
              error={profileForm.errors.new_password}
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  value={passwords.new_password}
                  onChange={(event) => {
                    setPasswords({
                      ...passwords,
                      new_password: event.target.value,
                    });
                    profileForm.clearField("new_password");
                  }}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
              )}
            </Field>
            <Field
              formId="profile-form"
              name="confirm"
              label="Confirm new password"
              error={profileForm.errors.confirm}
              hint="Only fill these in to change your password. Doing so signs out your other browsers."
            >
              {(control) => (
                <input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(event) => {
                    setPasswords({ ...passwords, confirm: event.target.value });
                    profileForm.clearField("confirm");
                  }}
                />
              )}
            </Field>
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
