"use client";
import { useState } from "react";

export function CopyButton({ value, label = "copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-text-subtle hover:text-text"
    >
      {copied ? "copied" : label}
    </button>
  );
}
