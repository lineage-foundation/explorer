import type { Context } from "hono";

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
}

export class ProblemError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(title);
    this.name = "ProblemError";
  }
}

export function problemJson(
  c: Context,
  status: number,
  title: string,
  detail?: string,
  extraHeaders?: Record<string, string>,
): Response {
  const body: Problem = {
    type: "about:blank",
    title,
    status,
    ...(detail ? { detail } : {}),
    instance: new URL(c.req.url).pathname,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json", ...extraHeaders },
  });
}
