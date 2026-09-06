"use client";

import { useEffect, useState } from "react";
import { MethodBadge } from "./MethodBadge.js";

export interface NavItem { id: string; method: string; path: string }
export interface NavGroup { tag: string; items: NavItem[] }

/**
 * Sticky endpoint navigation with scroll-spy. Highlights the endpoint nearest
 * the top of the viewport as the reader scrolls, and updates on click.
 */
export function DocsSidebar({ groups }: { groups: NavGroup[] }) {
  const [active, setActive] = useState<string>(groups[0]?.items[0]?.id ?? "");

  useEffect(() => {
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // A band near the top of the viewport so the "current" section is the one
      // the reader has scrolled to, not one still far below the fold.
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    for (const el of sections) observer.observe(el);
    return () => observer.disconnect();
  }, [groups]);

  return (
    <nav aria-label="API endpoints" className="flex flex-col gap-5 text-sm">
      {groups.map((group) => (
        <div key={group.tag}>
          <div className="mb-1.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-text-subtle">
            {group.tag}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const isActive = item.id === active;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={() => setActive(item.id)}
                    aria-current={isActive ? "true" : undefined}
                    className={`group flex items-center gap-2 rounded px-2 py-1 ${
                      isActive ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface hover:text-text"
                    }`}
                  >
                    <MethodBadge method={item.method} />
                    <span className="truncate font-mono text-xs">{item.path.replace(/^\/api\/v1/, "")}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
