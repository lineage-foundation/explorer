// Minimal OpenAPI 3.1 reading helpers for the docs page. We render our own spec,
// so only the subset of OpenAPI our zod-openapi routes emit is handled.

export interface SchemaObject {
  $ref?: string;
  type?: string | string[];
  format?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaObject;
  enum?: unknown[];
  nullable?: boolean;
  description?: string;
  example?: unknown;
  default?: unknown;
  anyOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  allOf?: SchemaObject[];
}

export interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject;
  example?: unknown;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: SchemaObject }>;
}

export interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  responses: Record<string, ResponseObject>;
}

export interface OpenApiDoc {
  info: { title: string; version: string; description?: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, SchemaObject> };
}

export interface DocEndpoint {
  method: string;
  path: string;
  op: Operation;
  /** DOM id anchor, unique per method+path. */
  id: string;
}

export interface DocGroup {
  tag: string;
  endpoints: DocEndpoint[];
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

// Preferred tag order; anything else falls to the end, alphabetically.
const TAG_ORDER = ["Blocks", "Transactions", "Addresses", "Items", "Chain"];

export function anchorId(method: string, path: string): string {
  return `${method}-${path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Flatten the paths object into tag-grouped, ordered endpoints. */
export function groupEndpoints(doc: OpenApiDoc): DocGroup[] {
  const byTag = new Map<string, DocEndpoint[]>();
  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = methods[method];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Other";
      const endpoint: DocEndpoint = { method: method.toUpperCase(), path, op, id: anchorId(method, path) };
      const bucket = byTag.get(tag);
      if (bucket) bucket.push(endpoint);
      else byTag.set(tag, [endpoint]);
    }
  }
  const rank = (tag: string): number => {
    const i = TAG_ORDER.indexOf(tag);
    return i === -1 ? TAG_ORDER.length : i;
  };
  return [...byTag.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([tag, endpoints]) => ({ tag, endpoints }));
}

export function resolveRef(doc: OpenApiDoc, schema: SchemaObject | undefined): SchemaObject {
  if (!schema) return {};
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop() ?? "";
    return doc.components?.schemas?.[name] ?? {};
  }
  return schema;
}

/**
 * Resolve `$ref`s and flatten `allOf` composition (how zod-openapi renders
 * `.extend()`ed schemas) into a single object schema by merging members'
 * properties and required lists. Non-allOf schemas are returned as resolved.
 */
export function flatten(doc: OpenApiDoc, schema: SchemaObject | undefined): SchemaObject {
  const resolved = resolveRef(doc, schema);
  if (!resolved.allOf) return resolved;
  const merged: SchemaObject = { type: "object", properties: {}, required: [] };
  const members = [...resolved.allOf, resolved]; // include the allOf schema's own props
  for (const member of members) {
    const f = member === resolved ? { properties: resolved.properties, required: resolved.required, description: resolved.description } : flatten(doc, member);
    if (f.properties) merged.properties = { ...merged.properties, ...f.properties };
    if (f.required) merged.required = [...(merged.required ?? []), ...f.required];
    if (f.description && !merged.description) merged.description = f.description;
  }
  return merged;
}

/** The display name of a $ref target (e.g. "TransactionSummary"), else null. */
export function refName(schema: SchemaObject | undefined): string | null {
  if (!schema?.$ref) return null;
  return schema.$ref.split("/").pop() ?? null;
}

/**
 * A human-readable type label: enums as `"a" | "b"`, arrays as `Type[]`,
 * `$ref`s as their model name, nullable as `Type | null`.
 */
export function typeLabel(doc: OpenApiDoc, schema: SchemaObject | undefined): string {
  if (!schema) return "any";
  if (schema.$ref) return refName(schema) ?? "object";

  // OpenAPI 3.1 nullability: either `type: [..., "null"]` or an anyOf/oneOf with
  // a `{ type: "null" }` branch.
  const union = schema.anyOf ?? schema.oneOf;
  if (union) {
    const parts = union.filter((s) => !(s.type === "null"));
    const nullable = union.some((s) => s.type === "null") || schema.nullable;
    const label = parts.map((s) => typeLabel(doc, s)).join(" | ") || "any";
    return nullable ? `${label} | null` : label;
  }

  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.filter((t) => t !== "null");
    const nullable = schema.type.includes("null");
    const base = nonNull[0] ?? "any";
    const label = base === "array" ? `${typeLabel(doc, schema.items)}[]` : base;
    return nullable ? `${label} | null` : label;
  }

  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (schema.type === "array") return `${typeLabel(doc, schema.items)}[]`;
  if (schema.type) return schema.nullable ? `${schema.type} | null` : schema.type;
  if (schema.properties) return "object";
  return "any";
}

export interface FieldRow {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  depth: number;
}

/**
 * Flatten a schema into indented field rows for a response/params table,
 * expanding nested objects, arrays of objects, and `$ref`s inline (depth-capped
 * to stay bounded on non-recursive schemas).
 */
export function fieldRows(
  doc: OpenApiDoc,
  schema: SchemaObject | undefined,
  depth = 0,
  maxDepth = 3,
): FieldRow[] {
  const resolved = flatten(doc, schema);
  const rows: FieldRow[] = [];

  const object = resolved.type === "object" || resolved.properties;
  if (object && resolved.properties) {
    const required = new Set(resolved.required ?? []);
    for (const [name, propRaw] of Object.entries(resolved.properties)) {
      const prop = propRaw;
      rows.push({
        name,
        type: typeLabel(doc, prop),
        required: required.has(name),
        description: prop.description ?? flatten(doc, prop).description,
        depth,
      });
      if (depth + 1 >= maxDepth) continue;
      const resolvedProp = flatten(doc, prop);
      if (resolvedProp.type === "object" || resolvedProp.properties) {
        rows.push(...fieldRows(doc, resolvedProp, depth + 1, maxDepth));
      } else if (resolvedProp.type === "array" && resolvedProp.items) {
        const item = flatten(doc, resolvedProp.items);
        if (item.type === "object" || item.properties) {
          rows.push(...fieldRows(doc, item, depth + 1, maxDepth));
        }
      }
    }
    return rows;
  }

  if (resolved.type === "array" && resolved.items) {
    return fieldRows(doc, resolved.items, depth, maxDepth);
  }
  return rows;
}

/** The JSON media type schema of the first 2xx response, if any. */
export function successSchema(doc: OpenApiDoc, op: Operation): { status: string; schema?: SchemaObject } | null {
  for (const [status, res] of Object.entries(op.responses ?? {})) {
    if (status.startsWith("2")) {
      return { status, schema: res.content?.["application/json"]?.schema };
    }
  }
  return null;
}

/** Build a representative example value from a schema, honouring `example`s. */
export function buildExample(doc: OpenApiDoc, schema: SchemaObject | undefined, depth = 0): unknown {
  if (depth > 6) return null;
  const resolved = flatten(doc, schema);
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum && resolved.enum.length > 0) return resolved.enum[0];

  const union = resolved.anyOf ?? resolved.oneOf;
  if (union) {
    const first = union.find((s) => s.type !== "null");
    return first ? buildExample(doc, first, depth + 1) : null;
  }

  const types = Array.isArray(resolved.type) ? resolved.type.filter((t) => t !== "null") : [resolved.type];
  const type = types[0];

  if (type === "object" || resolved.properties) {
    const out: Record<string, unknown> = {};
    for (const [name, prop] of Object.entries(resolved.properties ?? {})) {
      out[name] = buildExample(doc, prop, depth + 1);
    }
    return out;
  }
  if (type === "array") return [buildExample(doc, resolved.items, depth + 1)];
  if (type === "string") return resolved.format === "date-time" ? "2026-01-01T00:00:00.000Z" : "string";
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  return null;
}

/** Fill path params from examples and append query params that carry examples. */
export function curlExample(baseUrl: string, endpoint: DocEndpoint): string {
  const params = endpoint.op.parameters ?? [];
  let path = endpoint.path;
  for (const p of params.filter((p) => p.in === "path")) {
    const value = String(paramExample(p) ?? `{${p.name}}`);
    path = path.replace(`{${p.name}}`, encodeURIComponent(value));
  }
  const query = params
    .filter((p) => p.in === "query" && paramExample(p) !== undefined)
    .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(paramExample(p)))}`);
  const qs = query.length ? `?${query.join("&")}` : "";
  const base = baseUrl.replace(/\/$/, "");
  const url = `${base}${path}${qs}`;
  return endpoint.method === "GET" ? `curl "${url}"` : `curl -X ${endpoint.method} "${url}"`;
}

function paramExample(p: Parameter): unknown {
  if (p.example !== undefined) return p.example;
  if (p.schema?.example !== undefined) return p.schema.example;
  return undefined;
}
