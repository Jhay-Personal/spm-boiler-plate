import { startTestServer } from "../support/server";

export const E2E_UPLOAD_DIR_NAME = "e2e-uploads";

export default async function globalSetup(): Promise<void> {
  await startTestServer({
    port: Number(process.env.E2E_PORT ?? 3312),
    uploadDirName: E2E_UPLOAD_DIR_NAME,
    // Point at a separate database when one is configured, so this suite
    // touches neither the developer's data nor the API suite's.
    databaseUrlVar: "E2E_DATABASE_URL",
  });
}
