import { requirePageModule } from "@/lib/guard";
import { getDashboardStats } from "@/features/dashboard/queries";
import { DashboardClient } from "@/features/dashboard/DashboardClient";

export default async function DashboardPage() {
  const user = await requirePageModule("dashboard");
  // Loaded on the server, so the figures arrive with the HTML instead of
  // after a client round-trip.
  const stats = await getDashboardStats();

  return <DashboardClient userName={user.full_name} stats={stats} />;
}
