"use client";

import { useRef, useState } from "react";

// Uploads to /api/upload and reports back the stored URL via onChange.
export default function PhotoUploader({ value, name, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Upload failed.");
      } else {
        onChange(data.url);
      }
    } catch {
      setErr("Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div>
      <div className="photo-upload">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="photo-preview" src={value} alt="photo" />
        ) : (
          <div className="photo-preview empty">{initials || "📷"}</div>
        )}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
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
                onClick={() => onChange("")}
                disabled={busy}
              >
                Remove
              </button>
            )}
          </div>
          <div className="hint">PNG, JPG, WEBP or GIF · up to 4 MB</div>
        </div>
      </div>
      {err && (
        <div className="alert error" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}
    </div>
  );
}
