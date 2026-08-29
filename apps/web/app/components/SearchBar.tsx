"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { classify } from "../../lib/search.js";

export function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { href } = classify(value);
    if (href) {
      setError(false);
      router.push(href);
    } else {
      setError(true);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(false);
        }}
        placeholder="Search block / tx / address…"
        aria-label="Search"
        className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-xs text-text placeholder:text-text-subtle focus:border-link focus:outline-none"
      />
      {error ? (
        <p className="mt-1 text-[0.7rem] text-danger">
          Unrecognized — enter a block number/hash, transaction, or address.
        </p>
      ) : null}
    </form>
  );
}
