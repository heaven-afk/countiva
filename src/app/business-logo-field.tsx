"use client";
import { useId, useRef, useState } from "react";
import { uploadBusinessLogo } from "../lib/business-logo";

export default function BusinessLogoField({
  initialValue = "",
  disabled = false,
  onBusyChange,
}: {
  initialValue?: string;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    onBusyChange(true);
    try {
      setValue(await uploadBusinessLogo(file));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t upload your logo.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="business-logo-field">
      <label htmlFor={`${id}-file`}>Business logo · optional</label>
      <input
        ref={input}
        id={`${id}-file`}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
        aria-describedby={`${id}-help`}
      />
      <small id={`${id}-help`}>
        PNG, JPEG or WebP, up to 2 MB. Your logo appears on receipts after
        saving.
      </small>
      {busy && <p role="status">Uploading your logo…</p>}
      {value && (
        <div className="business-logo-preview">
          <img src={value} alt="Your business logo preview" />
          <button
            type="button"
            className="button secondary"
            disabled={disabled || busy}
            onClick={() => {
              setValue("");
              setError("");
            }}
          >
            Remove logo
          </button>
        </div>
      )}
      <label htmlFor={`${id}-url`}>Or use a logo image URL</label>
      <input
        id={`${id}-url`}
        name="logo_url"
        type="url"
        pattern="https://.*"
        maxLength={1000}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
        }}
        disabled={disabled || busy}
        placeholder="https://…"
      />
      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
