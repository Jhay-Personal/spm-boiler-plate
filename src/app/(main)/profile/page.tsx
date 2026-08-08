import { requirePageModule } from "@/lib/guard";
import { ProfileClient } from "@/features/profile/ProfileClient";

export default async function ProfilePage() {
  // `profile` is in ALWAYS_ALLOWED, so this passes for any signed-in user —
  // the call is still here so the page has an explicit, uniform guard.
  const user = await requirePageModule("profile");
  return <ProfileClient user={user} />;
}
