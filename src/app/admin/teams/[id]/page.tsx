import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TeamForm from "../TeamForm";
import TeamSeasonForm from "../TeamSeasonForm";
import TeamMembersManager from "../TeamMembersManager";
import { updateTeam } from "../actions";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: team },
    { data: activeSeason },
    { data: conferences },
    { data: groups },
    { data: teamSeasons },
  ] = await Promise.all([
    supabase.from("teams").select("id, team_name, logo_url").eq("id", Number(id)).single(),
    supabase.from("seasons").select("id, name, is_active").eq("is_active", true).maybeSingle(),
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("groups").select("id, name, conference_id").order("name"),
    supabase
      .from("team_seasons")
      .select("team_id, season_id, conference_id, group_id, draft_pool_id, draft_position")
      .eq("team_id", Number(id)),
  ]);

  if (!team) notFound();

  const activePlacement = activeSeason
    ? (teamSeasons ?? []).find((ts) => ts.season_id === activeSeason.id)
    : null;

  const { data: draftPools } = activeSeason
    ? await supabase.from("draft_pools").select("id, name").eq("season_id", activeSeason.id).order("name")
    : { data: [] };

  const { data: members } = activeSeason
    ? await supabase
        .from("team_members")
        .select("id, discord_id, showdown_name, role")
        .eq("team_id", Number(id))
        .eq("season_id", activeSeason.id)
        .order("discord_id")
    : { data: [] };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Edit Team</h1>
      <TeamForm action={updateTeam} team={team} />
      <TeamSeasonForm
        // Forces a remount whenever the saved placement actually changes,
        // so the form's fields (several of which are uncontrolled,
        // defaultValue-driven inputs) pick up the fresh values instead of
        // keeping whatever they were at the form's last mount.
        key={`${activePlacement?.conference_id ?? "none"}-${activePlacement?.group_id ?? "none"}-${activePlacement?.draft_pool_id ?? "none"}-${activePlacement?.draft_position ?? "none"}`}
        teamId={Number(id)}
        activeSeason={activeSeason ?? null}
        conferences={conferences ?? []}
        groups={groups ?? []}
        draftPools={draftPools ?? []}
        teamSeasons={teamSeasons ?? []}
      />
      <TeamMembersManager
        teamId={Number(id)}
        seasonId={activeSeason?.id ?? 0}
        members={members ?? []}
      />
    </div>
  );
}
