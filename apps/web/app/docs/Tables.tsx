import type { ReactNode } from "react";
import { typeLabel, type FieldRow, type OpenApiDoc, type Parameter } from "../../lib/openapi.js";

function HeadCell({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-border px-3 py-2 text-left font-mono text-[0.65rem] uppercase tracking-[0.06em] text-text-subtle">
      {children}
    </th>
  );
}

function Req({ required }: { required: boolean }) {
  return required
    ? <span className="font-mono text-[0.65rem] text-accent">required</span>
    : <span className="font-mono text-[0.65rem] text-text-subtle">optional</span>;
}

export function ParamsTable({ doc, params }: { doc: OpenApiDoc; params: Parameter[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr><HeadCell>Name</HeadCell><HeadCell>Type</HeadCell><HeadCell>In</HeadCell><HeadCell>Required</HeadCell><HeadCell>Description</HeadCell></tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={`${p.in}-${p.name}`} className="align-top">
              <td className="border-b border-border px-3 py-2 font-mono text-xs text-text">{p.name}</td>
              <td className="border-b border-border px-3 py-2 font-mono text-xs text-link">{typeLabel(doc, p.schema)}</td>
              <td className="border-b border-border px-3 py-2 font-mono text-xs text-text-muted">{p.in}</td>
              <td className="border-b border-border px-3 py-2"><Req required={p.required ?? false} /></td>
              <td className="border-b border-border px-3 py-2 text-xs text-text-muted">{p.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SchemaTable({ rows }: { rows: FieldRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No response body.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr><HeadCell>Field</HeadCell><HeadCell>Type</HeadCell><HeadCell>Required</HeadCell><HeadCell>Description</HeadCell></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} className="align-top">
              <td className="border-b border-border px-3 py-2 font-mono text-xs text-text">
                <span style={{ paddingLeft: `${r.depth * 1}rem` }} className="inline-block">
                  {r.depth > 0 && <span className="text-text-subtle">└ </span>}
                  {r.name}
                </span>
              </td>
              <td className="border-b border-border px-3 py-2 font-mono text-xs text-link">{r.type}</td>
              <td className="border-b border-border px-3 py-2"><Req required={r.required} /></td>
              <td className="border-b border-border px-3 py-2 text-xs text-text-muted">{r.description ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
