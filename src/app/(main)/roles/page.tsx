import { requirePageModule } from "@/lib/guard";
import { listRoles } from "@/features/roles/queries";
import { RolesClient } from "@/features/roles/RolesClient";

export default async function RolesPage() {
  await requirePageModule("roles");
  const roles = await listRoles();

  return <RolesClient initialRoles={roles} />;
}
