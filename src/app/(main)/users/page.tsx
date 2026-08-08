import { isSuper, requirePageModule } from "@/lib/guard";
import { listUsers } from "@/features/users/queries";
import { listRoles } from "@/features/roles/queries";
import { UsersClient } from "@/features/users/UsersClient";

export default async function UsersPage() {
  const user = await requirePageModule("users");
  const canManagePrivileges = isSuper(user);

  // Only a super admin may assign roles, so only they need the group list.
  const [users, roles] = await Promise.all([
    listUsers(),
    canManagePrivileges ? listRoles() : Promise.resolve([]),
  ]);

  return (
    <UsersClient
      initialUsers={users}
      roles={roles}
      // The client hides role/status controls for non-super admins. The API
      // enforces the same rule independently — this only avoids showing a
      // control that would fail.
      canManagePrivileges={canManagePrivileges}
      currentUserId={user.id}
    />
  );
}
