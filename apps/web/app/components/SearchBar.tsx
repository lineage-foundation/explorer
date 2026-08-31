"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { classify } from "../../lib/search.js";
import type { Suggestion } from "../../lib/resolve-search.js";

function glyph(kind: Suggestion["kind"]): string {
  if (kind === "block") return "▣";
  if (kind === "tx") return "↔";
  return "◈";
}

export function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState(false);
  const listId = "search-suggestions";

  useEffect(() => {
    const q = value.trim();
    if (q === "") { setSuggestions([]); setOpen(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
          if (!res.ok) return;
          const data = (await res.json()) as { suggestions: Suggestion[] };
          setSuggestions(data.suggestions);
          setOpen(data.suggestions.length > 0);
          setActive(-1);
        } catch {
          /* aborted or network error — keep the box usable */
        }
      })();
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value]);

  function go(href: string): void {
    setError(false);
    setOpen(false);
    setSuggestions([]);
    setValue("");
    router.push(href);
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (open && suggestions.length > 0) {
      const pick = active >= 0 ? suggestions[active] : suggestions[0];
      if (pick) { go(pick.href); return; }
    }
    const { href } = classify(value);
    if (href) go(href);
    else setError(true);
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <form onSubmit={submit} className="relative w-full" role="search">
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `search-opt-${active}` : undefined}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false); }}
        onKeyDown={onKeyDown}
        onBlur={() => { setTimeout(() => setOpen(false), 120); }}
        placeholder="Search block / tx / address…"
        aria-label="Search"
        aria-describedby={error ? "search-error" : undefined}
        className="w-full rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-xs text-text placeholder:text-text-subtle focus:border-link focus:outline-none"
      />
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-raised shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.href}
              id={`search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); go(s.href); }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="font-mono text-text">
                <span className="mr-2 text-text-subtle">{glyph(s.kind)}</span>
                {s.label}
              </span>
              {s.sublabel ? (
                <span className={`font-mono ${s.found ? "text-text-muted" : "text-danger"}`}>{s.sublabel}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id="search-error" role="alert" className="mt-1 text-[0.7rem] text-danger">
          Unrecognized — enter a block number/hash, transaction, or address.
        </p>
      ) : null}
    </form>
  );
}
