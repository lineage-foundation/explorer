import { resetTestSchema } from "@explorer/db/test-support";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://explorer:explorer@127.0.0.1:5432/explorer_test";

export default async function setup() {
  process.env.DATABASE_URL = TEST_DB_URL;
  await resetTestSchema(TEST_DB_URL);
}
