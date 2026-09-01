"use client";
import { useState } from "react";

export function CopyButton({ value, label = "copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      // Accessing navigator.clipboard throws in insecure contexts, and
      // writeText can reject (permission denied, lost focus). Handle both so a
      // failed copy shows feedback instead of an unhandled rejection.
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 1200);
  }

  const text = state === "copied" ? "copied" : state === "error" ? "failed" : label;
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label === "copy" ? "to clipboard" : label}`}
        className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-text-subtle hover:text-text"
      >
        {text}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied to clipboard" : state === "error" ? "Copy failed" : ""}
      </span>
    </>
  );
}
