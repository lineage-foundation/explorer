import { headers } from "next/headers";
import type { Metadata } from "next";
import { getOpenApiDocument } from "@explorer/api";
import { TOKEN_DISPLAY_NAME } from "@explorer/config";
import { ApiReference } from "./ApiReference.js";
import type { OpenApiDoc } from "../../lib/openapi.js";

export const metadata: Metadata = {
  title: `API reference · ${TOKEN_DISPLAY_NAME} Explorer`,
  description: `REST API reference for the ${TOKEN_DISPLAY_NAME} block explorer.`,
};

export default async function DocsPage() {
  // Generated in-process from the API route definitions — the same spec served
  // at /api/v1/openapi.json, no DB or network needed.
  const doc = getOpenApiDocument() as unknown as OpenApiDoc;
  // Derive the base URL from the request so examples use whatever host serves
  // the page (testnet today, mainnet later) without extra configuration.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${proto}://${host}` : (doc.servers?.[0]?.url ?? "");
  return <ApiReference doc={doc} baseUrl={baseUrl} />;
}
