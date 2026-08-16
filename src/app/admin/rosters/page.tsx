import { createClient } from "@/lib/supabase/server";
import RosterManager from "./RosterManager";

export default async function AdminRostersPage() {
  const supabase = await createClient();

  const [
    { data: seasons },
    { data: teams },
    { data: teamSeasons },
    { data: pokemon },
    { data: roster },
    { data: draftPools },
    { data: transactions },
    { data: transactionItems },
  ] = await Promise.all([
    supabase.from("seasons").select("id, name, fa_tokens").order("created_at", { ascending: false }),
    supabase.from("teams").select("id, team_name").order("team_name"),
    supabase
      .from("team_seasons")
      .select("team_id, season_id, conference_id, draft_pool_id, draft_ended_at, fa_tokens_adjustment"),
    supabase.from("pokemon").select("id, name").order("name"),
    supabase.from("rosters").select("pokemon_id, season_id, conference_id, team_id, pokemon(name)"),
    supabase.from("draft_pools").select("id, is_active"),
    supabase.from("transactions").select("id, season_id, type"),
    supabase.from("transaction_items").select("transaction_id, team_id, action"),
  ]);

  // Free agency tokens used so far, per team+season — lets the admin see
  // how many of a team's tokens are already spent before adjusting them.
  const freeAgencyTxIds = new Set(
    (transactions ?? []).filter((t) => t.type === "free_agency").map((t) => t.id)
  );
  const txSeasonById = new Map((transactions ?? []).map((t) => [t.id, t.season_id]));
  const faTokensUsedByTeamSeason: Record<string, number> = {};
  for (const item of transactionItems ?? []) {
    if (item.action !== "add" || !freeAgencyTxIds.has(item.transaction_id)) continue;
    const seasonId = txSeasonById.get(item.transaction_id);
    if (seasonId === undefined) continue;
    const key = `${seasonId}:${item.team_id}`;
    faTokensUsedByTeamSeason[key] = (faTokensUsedByTeamSeason[key] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Rosters</h1>
      <RosterManager
        seasons={seasons ?? []}
        teams={teams ?? []}
        teamSeasons={teamSeasons ?? []}
        pokemon={pokemon ?? []}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        roster={(roster ?? []) as any}
        draftPools={draftPools ?? []}
        faTokensUsedByTeamSeason={faTokensUsedByTeamSeason}
      />
    </div>
  );
}
