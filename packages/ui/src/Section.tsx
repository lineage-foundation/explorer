import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow.js";
import { Heading } from "./Heading.js";

export function Section({
  eyebrow, title, level = 2, children,
}: { eyebrow?: string; title?: string; level?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return (
    <section className="py-8">
      {(eyebrow || title) ? (
        <div className="mb-5 border-l-[3px] border-accent pl-4">
          {eyebrow ? <div className="mb-1"><Eyebrow>{eyebrow}</Eyebrow></div> : null}
          {title ? <Heading level={level}>{title}</Heading> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
