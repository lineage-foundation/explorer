import { describe, it, expect } from "vitest";
import { createHealthServer } from "../health-server.js";

const baseStatus = {
  lastIndexedBlock: 5, chainTip: 7, lag: 2, lockHeld: true,
  lastSupplyUpdate: null, halted: null, stalled: null,
};

it("serves /health and /status", async () => {
  const server = createHealthServer({ port: 0, getStatus: () => ({ ...baseStatus }) });
  const port = await server.start();
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  expect(health.status).toBe(200);
  expect(((await health.json()) as { status: string }).status).toBe("ok");
  const status = (await (await fetch(`http://127.0.0.1:${port}/status`)).json()) as { lag: number };
  expect(status.lag).toBe(2);
  await server.stop();
});

it("reports 503 'stalled' when the worker is repeatedly failing", async () => {
  const server = createHealthServer({
    port: 0,
    getStatus: () => ({ ...baseStatus, stalled: "12 consecutive cycle failures: node down" }),
  });
  const port = await server.start();
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  expect(health.status).toBe(503);
  expect(((await health.json()) as { status: string }).status).toBe("stalled");
  await server.stop();
});

it("reports 503 'halted' when ingestion has permanently halted", async () => {
  const server = createHealthServer({
    port: 0,
    getStatus: () => ({ ...baseStatus, halted: "Continuity break at block 42" }),
  });
  const port = await server.start();
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  expect(health.status).toBe(503);
  expect(((await health.json()) as { status: string }).status).toBe("halted");
  await server.stop();
});
