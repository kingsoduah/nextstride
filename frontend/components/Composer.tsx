"use client";
import { useState } from "react";

export function Composer({
  onSubmit,
  loading,
  placeholder,
}: {
  onSubmit: (text: string) => Promise<void>;
  loading: boolean;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !loading) void onSubmit(value.trim());
      }}
    >
      <label className="muted" htmlFor="composer-input" style={{ fontSize: 13 }}>
        Describe what&apos;s competing — times and deadlines help
      </label>
      <textarea
        id="composer-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="What's competing for your attention?"
      />
      <div className="composer-footer">
        <span className="muted" style={{ fontSize: 13 }}>
          AI recommends · you decide
        </span>
        <button className="icon-btn primary" type="submit" disabled={loading || !value.trim()} aria-label="Analyze my situation">
          {loading ? "…" : "↑"}
        </button>
      </div>
    </form>
  );
}

export function ControlledComposer({
  value,
  setValue,
  onSubmit,
  loading,
  placeholder,
  submitLabel,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: () => Promise<void>;
  loading: boolean;
  placeholder: string;
  submitLabel: string;
}) {
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !loading) void onSubmit();
      }}
    >
      <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={submitLabel} />
      <div className="composer-footer">
        <span />
        <button className="icon-btn primary" type="submit" disabled={loading || !value.trim()} aria-label={submitLabel}>
          {loading ? "…" : "↑"}
        </button>
      </div>
    </form>
  );
}
