import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscordUsername } from "@/lib/supabase/admin";
import AdminSidebar from "./AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const discordUsername = getDiscordUsername(user.user_metadata);
  if (!discordUsername) redirect("/");

  const { data: admin } = await supabase
    .from("admins")
    .select("discord_id")
    .ilike("discord_id", discordUsername)
    .single();

  if (!admin) redirect("/");

  return (
    <div className="flex flex-1 pt-16 min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
