import { requireModule } from "@/lib/guard";
import { ok, route } from "@/lib/api";
import { getDashboardStats } from "@/features/dashboard/queries";

export const runtime = "nodejs";

export const GET = route("GET /api/dashboard", async () => {
  await requireModule("dashboard");
  return ok(await getDashboardStats());
});
