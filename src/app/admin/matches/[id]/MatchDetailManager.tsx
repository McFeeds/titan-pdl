"use client";

import { useActionState, useTransition, useState } from "react";
import {
  upsertMatchGame,
  addMatchGamePokemon,
  removeMatchGamePokemon,
  clearMatchResults,
} from "../actions";

const selectCls =
  "px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm [&>option]:bg-[#0d0d1f]";
const inputCls =
  "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm";

type Team = { id: number; team_name: string };
type Pokemon = { id: number; name: string };
type MatchGamePokemon = {
  id: number;
  team_id: number;
  pokemon_id: number;
  kills: number;
  deaths: number;
  pokemon: { name: string } | null;
};
type MatchGame = {
  id: number;
  game_number: number;
  winner_team_id: number | null;
  replay_url: string | null;
  match_game_pokemon: MatchGamePokemon[];
};

type Props = {
  matchId: number;
  homeTeam: Team;
  awayTeam: Team;
  games: MatchGame[];
  allPokemon: Pokemon[];
};

function GameSection({
  matchId,
  gameNumber,
  game,
  homeTeam,
  awayTeam,
  allPokemon,
}: {
  matchId: number;
  gameNumber: number;
  game: MatchGame | undefined;
  homeTeam: Team;
  awayTeam: Team;
  allPokemon: Pokemon[];
}) {
  const [gameState, gameAction, gamePending] = useActionState(upsertMatchGame, null);
  const [addHomeState, addHomeAction, addHomePending] = useActionState(addMatchGamePokemon, null);
  const [addAwayState, addAwayAction, addAwayPending] = useActionState(addMatchGamePokemon, null);
  const [removePending, startRemove] = useTransition();

  const homePokemon = (game?.match_game_pokemon ?? []).filter(
    (p) => p.team_id === homeTeam.id
  );
  const awayPokemon = (game?.match_game_pokemon ?? []).filter(
    (p) => p.team_id === awayTeam.id
  );

  function handleRemove(mgpId: number) {
    const fd = new FormData();
    fd.append("id", mgpId.toString());
    fd.append("match_id", matchId.toString());
    startRemove(async () => {
      await removeMatchGamePokemon(fd);
    });
  }

  const usedByHome = new Set(homePokemon.map((p) => p.pokemon_id));
  const usedByAway = new Set(awayPokemon.map((p) => p.pokemon_id));
  const availableForHome = allPokemon.filter((p) => !usedByHome.has(p.id));
  const availableForAway = allPokemon.filter((p) => !usedByAway.has(p.id));

  return (
    <div className="border border-white/10 rounded-xl p-5 flex flex-col gap-5">
      <h3 className="text-base font-semibold text-white">Game {gameNumber}</h3>

      {/* Winner + replay */}
      <form action={gameAction} className="flex flex-col gap-3">
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="game_number" value={gameNumber} />
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Winner</label>
            <select
              name="winner_team_id"
              defaultValue={game?.winner_team_id?.toString() ?? ""}
              className={`${selectCls} w-48`}
            >
              <option value="">— No winner yet —</option>
              <option value={homeTeam.id}>{homeTeam.team_name}</option>
              <option value={awayTeam.id}>{awayTeam.team_name}</option>
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-gray-400 mb-1">Replay URL</label>
            <input
              name="replay_url"
              defaultValue={game?.replay_url ?? ""}
              placeholder="https://replay.pokemonshowdown.com/..."
              className={`${inputCls} w-full`}
            />
          </div>
          <div className="self-end">
            <button
              type="submit"
              disabled={gamePending}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {gamePending ? "Saving…" : "Save Game"}
            </button>
          </div>
        </div>
        {gameState?.error && (
          <p className="text-red-400 text-xs">{gameState.error}</p>
        )}
      </form>

      {/* Pokemon per team */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {([
          { team: homeTeam, teamPokemon: homePokemon, addAction: addHomeAction, addPending: addHomePending, addState: addHomeState, available: availableForHome },
          { team: awayTeam, teamPokemon: awayPokemon, addAction: addAwayAction, addPending: addAwayPending, addState: addAwayState, available: availableForAway },
        ] as const).map(({ team, teamPokemon, addAction, addPending, addState, available }) => (
          <div key={team.id}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {team.team_name}
            </p>

            {teamPokemon.length > 0 && (
              <ul className="flex flex-col gap-1 mb-3">
                {teamPokemon.map((mgp) => (
                  <li key={mgp.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg text-sm">
                    <span className="flex-1 text-white">{mgp.pokemon?.name ?? `#${mgp.pokemon_id}`}</span>
                    <span className="text-gray-400 text-xs">K:{mgp.kills} D:{mgp.deaths}</span>
                    <button
                      onClick={() => handleRemove(mgp.id)}
                      disabled={removePending}
                      className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50 shrink-0"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {game && (
              <form action={addAction} className="flex items-center gap-2 flex-wrap">
                <input type="hidden" name="match_game_id" value={game.id} />
                <input type="hidden" name="match_id" value={matchId} />
                <input type="hidden" name="team_id" value={team.id} />
                <select name="pokemon_id" className={`${selectCls} flex-1 min-w-32`} defaultValue="">
                  <option value="">— Pokémon —</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input name="kills" type="number" min={0} defaultValue={0} placeholder="K" className={`${inputCls} w-14`} />
                <input name="deaths" type="number" min={0} defaultValue={0} placeholder="D" className={`${inputCls} w-14`} />
                <button
                  type="submit"
                  disabled={addPending}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
                >
                  {addPending ? "…" : "Add"}
                </button>
                {addState?.error && (
                  <p className="text-red-400 text-xs w-full">{addState.error}</p>
                )}
              </form>
            )}

            {!game && (
              <p className="text-gray-600 text-xs italic">Save game result first to add Pokémon.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchDetailManager({ matchId, homeTeam, awayTeam, games, allPokemon }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [clearPending, startClear] = useTransition();
  const hasResults = games.length > 0;

  function handleClear() {
    const fd = new FormData();
    fd.append("match_id", matchId.toString());
    startClear(async () => {
      await clearMatchResults(fd);
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Clear results */}
      {hasResults && (
        <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
          <p className="text-sm text-gray-400 flex-1">
            {confirming
              ? "This will delete all game results and pokemon stats for this match. Are you sure?"
              : "Remove all recorded results for this match."}
          </p>
          {confirming ? (
            <>
              <button
                onClick={handleClear}
                disabled={clearPending}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {clearPending ? "Clearing…" : "Yes, clear"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={clearPending}
                className="px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 rounded-lg transition-colors"
            >
              Clear Results
            </button>
          )}
        </div>
      )}

      {[1, 2, 3].map((n) => (
        <GameSection
          key={n}
          matchId={matchId}
          gameNumber={n}
          game={games.find((g) => g.game_number === n)}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          allPokemon={allPokemon}
        />
      ))}
    </div>
  );
}
