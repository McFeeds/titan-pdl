import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MatchDetailManager from "./MatchDetailManager";

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: match }, { data: allPokemon }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, season_id, week_number, home_team_id, away_team_id")
      .eq("id", Number(id))
      .single(),
    supabase.from("pokemon").select("id, name").order("name"),
  ]);

  if (!match) notFound();

  const [{ data: homeTeam }, { data: awayTeam }, { data: games }, { data: season }] = await Promise.all([
    supabase.from("teams").select("id, team_name").eq("id", match.home_team_id).single(),
    supabase.from("teams").select("id, team_name").eq("id", match.away_team_id).single(),
    supabase
      .from("match_games")
      .select("id, game_number, game_type, winner_team_id, replay_url, match_game_pokemon(id, team_id, pokemon_id, kills, deaths, pokemon(name))")
      .eq("match_id", Number(id))
      .order("game_number"),
    supabase.from("seasons").select("match_format").eq("id", match.season_id).single(),
  ]);

  if (!homeTeam || !awayTeam) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/matches" className="text-xs text-gray-500 hover:text-gray-300 mb-2 block">
          ← Matches
        </Link>
        <h1 className="text-2xl font-bold text-white">
          {homeTeam.team_name}
          <span className="text-gray-500 font-normal mx-3">vs</span>
          {awayTeam.team_name}
        </h1>
        <p className="text-sm text-gray-400 mt-1">Week {match.week_number}</p>
      </div>

      <MatchDetailManager
        matchId={match.id}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        games={(games ?? []) as any}
        allPokemon={allPokemon ?? []}
        matchFormat={season?.match_format ?? "bo3"}
      />
    </div>
  );
}
