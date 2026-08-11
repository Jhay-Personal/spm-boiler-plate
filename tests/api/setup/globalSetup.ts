import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  startTestServer,
  stopTestServer,
} from "../../support/server";

// The API suite's slice of the shared harness. See tests/support/server.ts —
// this is DESTRUCTIVE to the database DATABASE_URL names.

const PORT = Number(process.env.TEST_PORT ?? 3311);
const UPLOAD_DIR_NAME = "test-uploads";

export { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD };

export async function setup(): Promise<void> {
  process.env.TEST_BASE_URL = await startTestServer({
    port: PORT,
    uploadDirName: UPLOAD_DIR_NAME,
  });
}

export async function teardown(): Promise<void> {
  await stopTestServer(UPLOAD_DIR_NAME);
}
