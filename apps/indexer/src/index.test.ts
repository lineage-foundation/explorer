import { describe, it, expect, vi } from "vitest";
import { createWorker } from "./index.js";

describe("createWorker", () => {
  it("closes the db handle on stop", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const worker = createWorker({
      logger: { info: vi.fn(), error: vi.fn() },
      dbHandle: { db: {}, close },
    });
    await worker.start();
    await worker.stop();
    expect(close).toHaveBeenCalledOnce();
  });
});
