import { seed } from "./seed.js";

// Seed once for the whole run. Spec files run in parallel workers against one
// database, so a per-file reseed would truncate tables under another file's tests.
export default async function globalSetup(): Promise<void> {
  await seed();
}
