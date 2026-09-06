import { IS_TESTNET } from "@explorer/config";
import { groupEndpoints, type OpenApiDoc } from "../../lib/openapi.js";
import { DocsSidebar, type NavGroup } from "./DocsSidebar.js";
import { EndpointSection } from "./EndpointSection.js";

export function ApiReference({ doc, baseUrl }: { doc: OpenApiDoc; baseUrl: string }) {
  const groups = groupEndpoints(doc);
  const nav: NavGroup[] = groups.map((g) => ({
    tag: g.tag,
    items: g.endpoints.map((e) => ({ id: e.id, method: e.method, path: e.path })),
  }));

  return (
    <div className="space-y-10">
      <header className="border-b border-border pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[0.65rem] text-text-muted">
          <span className="text-accent">●</span>
          {doc.info.title} · v{doc.info.version} · OpenAPI 3.1.0
        </div>
        <h1 className="mt-4 font-display text-3xl text-text">API reference</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
          {doc.info.description ?? "Read-only REST API for the block explorer."}{" "}
          Read blocks, transactions, addresses, items, and supply over plain HTTP. Every
          endpoint is grouped by resource, with its parameters, response shape, and an example.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-text-subtle">Base URL</span>
            <code className="font-mono text-xs text-link">{baseUrl}</code>
          </div>
          <a href="/api/v1/openapi.json" className="text-link hover:text-link-hover">OpenAPI spec ↗</a>
          <a href="/api/v1/docs" className="text-link hover:text-link-hover">Interactive console ↗</a>
        </div>
        {IS_TESTNET && (
          <p className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-muted">
            <span className="font-semibold text-warning">Testnet.</span>{" "}
            These endpoints serve the public testnet. A mainnet will be announced separately.
          </p>
        )}
      </header>

      <div className="flex gap-10">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8 pr-2">
            <DocsSidebar groups={nav} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {groups.map((group) => (
            <div key={group.tag}>
              <div className="pt-6 font-display text-xs uppercase tracking-[0.14em] text-accent">{group.tag}</div>
              {group.endpoints.map((endpoint) => (
                <EndpointSection key={endpoint.id} doc={doc} endpoint={endpoint} baseUrl={baseUrl} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
