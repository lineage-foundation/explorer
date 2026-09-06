import { PUBLIC_API_URL } from "@explorer/config";

/**
 * The OpenAPI document metadata, shared by the served `/api/v1/openapi.json`
 * route and the in-process document generator (see openapi-document.ts). Kept
 * in its own module so both can import it without a circular dependency.
 */
export const OPENAPI_INFO = {
  openapi: "3.1.0" as const,
  info: {
    title: "Lineage Explorer API",
    version: "1.0.0",
    description: "Read-only public REST API for the Lineage block explorer.",
  },
  servers: [{ url: PUBLIC_API_URL }],
};
