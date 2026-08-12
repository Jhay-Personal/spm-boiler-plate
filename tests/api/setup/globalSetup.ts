import {
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  startTestServer,
  stopTestServer,
} from "../../support/server";

// The API suite's slice of the shared harness. See tests/support/server.ts.
//
// DESTRUCTIVE: it drops admin_users and roles from whatever database it is
// pointed at. Set TEST_DATABASE_URL to keep it off your development database —
// otherwise it falls back to DATABASE_URL and will delete the admin account you
// sign in with.

const PORT = Number(process.env.TEST_PORT ?? 3311);
const UPLOAD_DIR_NAME = "test-uploads";

export { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD };

export async function setup(): Promise<void> {
  process.env.TEST_BASE_URL = await startTestServer({
    port: PORT,
    uploadDirName: UPLOAD_DIR_NAME,
    databaseUrlVar: "TEST_DATABASE_URL",
  });
}

export async function teardown(): Promise<void> {
  await stopTestServer(UPLOAD_DIR_NAME);
}
