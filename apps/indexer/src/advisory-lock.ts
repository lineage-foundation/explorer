import type postgres from "postgres";

// Fixed application-wide advisory-lock key (stable constant; must not change across deployments).
const LOCK_KEY = 1_279_874_392;

export function createAdvisoryLock(sql: ReturnType<typeof postgres>): {
  tryAcquire: () => Promise<boolean>;
  release: () => Promise<void>;
} {
  let reserved: Awaited<ReturnType<typeof sql.reserve>> | null = null;
  return {
    async tryAcquire() {
      if (!reserved) reserved = await sql.reserve();
      const rows = await reserved`select pg_try_advisory_lock(${LOCK_KEY}) as locked`;
      const locked = rows[0]?.locked === true;
      if (!locked) { reserved.release(); reserved = null; }
      return locked;
    },
    async release() {
      if (!reserved) return;
      await reserved`select pg_advisory_unlock(${LOCK_KEY})`;
      reserved.release();
      reserved = null;
    },
  };
}
