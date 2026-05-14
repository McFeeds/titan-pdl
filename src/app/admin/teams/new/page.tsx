import { createClient } from "@/lib/supabase/server";
import TeamForm from "../TeamForm";
import { createTeam } from "../actions";

export default async function NewTeamPage() {
  const supabase = await createClient();
  const [{ data: conferences }, { data: groups }] = await Promise.all([
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("groups").select("id, name, conference_id").order("name"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Add Team</h1>
      <TeamForm
        action={createTeam}
        conferences={conferences ?? []}
        groups={groups ?? []}
      />
    </div>
  );
}
