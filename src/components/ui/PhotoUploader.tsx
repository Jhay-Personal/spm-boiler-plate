"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useErrorDialog } from "./ErrorDialogProvider";
import { initialsFor } from "./Avatar";

type PhotoUploaderProps = {
  value: string | null;
  name: string;
  onChange: (url: string | null) => void;
};

/** Uploads to /api/upload and reports the stored URL back via `onChange`. */
export default function PhotoUploader({
  value,
  name,
  onChange,
}: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { reportError } = useErrorDialog();

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const data = await apiFetch<{ url: string }>("/api/upload", {
        method: "POST",
        body,
      });
      onChange(data.url);
    } catch (err) {
      reportError(err, "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="photo-upload">
      {value ? (
        <img className="photo-preview" src={value} alt="Selected profile photo" />
      ) : (
        <div className="photo-preview empty" aria-hidden="true">
          {initialsFor(name) || "📷"}
        </div>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <div className="btn-row">
          <button
            type="button"
            className="btn sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Uploading…" : value ? "Change photo" : "Upload photo"}
          </button>
          {value && (
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => onChange(null)}
              disabled={busy}
            >
              Remove
            </button>
          )}
        </div>
        <div className="hint">PNG, JPG, WEBP or GIF · up to 4 MB</div>
      </div>
    </div>
  );
}
