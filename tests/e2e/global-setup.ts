import { startTestServer } from "../support/server";

export const E2E_UPLOAD_DIR_NAME = "e2e-uploads";

export default async function globalSetup(): Promise<void> {
  await startTestServer({
    port: Number(process.env.E2E_PORT ?? 3312),
    uploadDirName: E2E_UPLOAD_DIR_NAME,
    // Point at a separate database when one is configured, so this suite and
    // the API suite cannot destroy each other's tables.
    databaseUrl: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL,
  });
}
