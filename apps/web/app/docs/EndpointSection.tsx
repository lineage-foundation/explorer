import type { ReactNode } from "react";
import {
  buildExample, curlExample, fieldRows, successSchema,
  type DocEndpoint, type OpenApiDoc,
} from "../../lib/openapi.js";
import { MethodBadge } from "./MethodBadge.js";
import { ParamsTable, SchemaTable } from "./Tables.js";
import { CodeBlock } from "./CodeBlock.js";

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 font-display text-sm text-text">{children}</h3>;
}

function statusTone(status: string): string {
  if (status.startsWith("2")) return "text-accent";
  if (status.startsWith("4") || status.startsWith("5")) return "text-danger";
  return "text-text-muted";
}

export function EndpointSection({
  doc, endpoint, baseUrl,
}: { doc: OpenApiDoc; endpoint: DocEndpoint; baseUrl: string }) {
  const { op, method, path, id } = endpoint;
  const params = op.parameters ?? [];
  const success = successSchema(doc, op);
  const responses = Object.entries(op.responses ?? {});
  const example = success?.schema ? buildExample(doc, success.schema) : undefined;

  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-10 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={method} />
        <code className="break-all font-mono text-sm text-text">{path}</code>
      </div>
      {op.summary && <h2 className="mt-3 font-display text-xl text-text">{op.summary}</h2>}
      {op.description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">{op.description}</p>}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          {params.length > 0 && (
            <div>
              <SectionLabel>Parameters</SectionLabel>
              <ParamsTable doc={doc} params={params} />
            </div>
          )}

          <div>
            <SectionLabel>Responses</SectionLabel>
            <div className="space-y-3">
              {responses.map(([status, res]) => {
                const contentType = Object.keys(res.content ?? {})[0];
                const isSuccess = status === success?.status;
                return (
                  <div key={status} className="rounded-md border border-border">
                    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-2">
                      <span className={`font-mono text-sm font-semibold ${statusTone(status)}`}>{status}</span>
                      {contentType && <span className="font-mono text-[0.65rem] text-text-subtle">{contentType}</span>}
                      {res.description && <span className="text-xs text-text-muted">{res.description}</span>}
                    </div>
                    {isSuccess && success?.schema && (
                      <div className="p-3">
                        <SchemaTable rows={fieldRows(doc, success.schema)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <SectionLabel>Example request</SectionLabel>
            <CodeBlock lang="curl" code={curlExample(baseUrl, endpoint)} />
          </div>
          {example !== undefined && (
            <div>
              <SectionLabel>Example response</SectionLabel>
              <CodeBlock lang="json" code={JSON.stringify(example, null, 2)} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
