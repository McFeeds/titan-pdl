import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TeamForm from "../TeamForm";
import { updateTeam } from "../actions";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: team }, { data: conferences }, { data: groups }] =
    await Promise.all([
      supabase.from("teams").select("*").eq("id", Number(id)).single(),
      supabase.from("conferences").select("id, name").order("name"),
      supabase.from("groups").select("id, name, conference_id").order("name"),
    ]);

  if (!team) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Edit Team</h1>
      <TeamForm
        action={updateTeam}
        conferences={conferences ?? []}
        groups={groups ?? []}
        team={team}
      />
    </div>
  );
}
