import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Status {
  lastIndexedBlock: number | null; chainTip: number | null; lag: number | null;
  lockHeld: boolean; lastSupplyUpdate: string | null;
  // `halted` = permanently stopped (continuity break). `stalled` = repeatedly
  // failing but still retrying (e.g. node/DB outage past the failure threshold).
  // Either makes /health report 503 so an orchestrator can act.
  halted: string | null; stalled: string | null;
}

export function createHealthServer(opts: { port: number; getStatus: () => Status }): {
  start: () => Promise<number>; stop: () => Promise<void>;
} {
  let server: Server | null = null;
  return {
    start() {
      return new Promise((resolve) => {
        server = createServer((req, res) => {
          const status = opts.getStatus();
          if (req.url === "/health") {
            const ok = status.halted === null && status.stalled === null;
            const label = status.halted !== null ? "halted" : status.stalled !== null ? "stalled" : "ok";
            res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
            res.end(JSON.stringify({ status: label }));
            return;
          }
          if (req.url === "/status") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(status));
            return;
          }
          res.writeHead(404); res.end();
        });
        server.listen(opts.port, "0.0.0.0", () => {
          resolve((server!.address() as AddressInfo).port);
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
      });
    },
  };
}
