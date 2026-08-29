import { describe, it, expect } from "vitest";
import { createHealthServer } from "../health-server.js";

it("serves /health and /status", async () => {
  const server = createHealthServer({
    port: 0, // ephemeral
    getStatus: () => ({ lastIndexedBlock: 5, chainTip: 7, lag: 2, lockHeld: true, lastSupplyUpdate: null, halted: null }),
  });
  const port = await server.start();
  const health = await fetch(`http://127.0.0.1:${port}/health`);
  expect(health.status).toBe(200);
  const status = (await (await fetch(`http://127.0.0.1:${port}/status`)).json()) as { lag: number };
  expect(status.lag).toBe(2);
  await server.stop();
});
