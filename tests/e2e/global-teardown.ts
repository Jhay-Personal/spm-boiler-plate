import { stopTestServer } from "../support/server";
import { E2E_UPLOAD_DIR_NAME } from "./global-setup";

export default async function globalTeardown(): Promise<void> {
  await stopTestServer(E2E_UPLOAD_DIR_NAME);
}
