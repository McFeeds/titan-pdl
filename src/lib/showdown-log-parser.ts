export interface ParsedGameResult {
  p1Username: string;
  p2Username: string;
  winner: "p1" | "p2" | null;
  p1Brought: string[];
  p2Brought: string[];
  p1Selected: string[];
  p2Selected: string[];
  p1Stats: Record<string, { kills: number; deaths: number }>;
  p2Stats: Record<string, { kills: number; deaths: number }>;
}

// "Dragonite, L50, M, shiny" or "Blastoise-Mega, L50, F" -> normalized base name
function extractPokemonName(detail: string): string {
  const baseName = detail.split(",")[0].trim();
  return baseName
    .replace(/-Mega(-[XY])?$/i, "")
    .replace(/-Primal$/i, "")
    .replace(/-Gmax$/i, "")
    .replace(/-Eternamax$/i, "");
}

// "p1a: Olm" -> "p1a", "p2b: Carl" -> "p2b", else null
function extractSlot(ident: string): string | null {
  const m = /^(p[12][a-d]):/.exec(ident);
  return m ? m[1] : null;
}

function getPlayer(slot: string): "p1" | "p2" | null {
  if (slot.startsWith("p1")) return "p1";
  if (slot.startsWith("p2")) return "p2";
  return null;
}

export function parseShowdownLog(logText: string): ParsedGameResult {
  const result: ParsedGameResult = {
    p1Username: "",
    p2Username: "",
    winner: null,
    p1Brought: [],
    p2Brought: [],
    p1Selected: [],
    p2Selected: [],
    p1Stats: {},
    p2Stats: {},
  };

  const slotPokemon: Record<string, string> = {};
  const lastAttacker: Record<string, string> = {};
  let currentMover: string | null = null;
  const p1Selected = new Set<string>();
  const p2Selected = new Set<string>();

  function ensureStats(player: "p1" | "p2", name: string) {
    const stats = player === "p1" ? result.p1Stats : result.p2Stats;
    if (!stats[name]) stats[name] = { kills: 0, deaths: 0 };
  }

  for (const rawLine of logText.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const parts = line.split("|");
    if (parts.length < 2) continue;
    const cmd = parts[1];

    switch (cmd) {
      case "player": {
        // |player|p1|username|avatar|  (duplicate/empty lines can appear — first non-empty wins)
        const slot = parts[2];
        const username = parts[3];
        if (!username) break;
        if (slot === "p1" && !result.p1Username) result.p1Username = username;
        if (slot === "p2" && !result.p2Username) result.p2Username = username;
        break;
      }

      case "poke": {
        // |poke|p1|Dragonite, L50, M, shiny|
        const player = parts[2];
        const name = extractPokemonName(parts[3] ?? "");
        if (!name) break;
        if (player === "p1") result.p1Brought.push(name);
        if (player === "p2") result.p2Brought.push(name);
        break;
      }

      case "switch":
      case "drag": {
        // |switch|p1a: Olm|Dragonite, L50, M, shiny|100/100
        const slot = extractSlot(parts[2] ?? "");
        if (!slot) break;
        const name = extractPokemonName(parts[3] ?? "");
        if (!name) break;
        slotPokemon[slot] = name;
        delete lastAttacker[slot];
        currentMover = null;
        const player = getPlayer(slot);
        if (player === "p1") { p1Selected.add(name); ensureStats("p1", name); }
        if (player === "p2") { p2Selected.add(name); ensureStats("p2", name); }
        break;
      }

      case "replace": {
        // Illusion (Zoroark) reveal - treat like a switch
        const slot = extractSlot(parts[2] ?? "");
        if (!slot) break;
        const name = extractPokemonName(parts[3] ?? "");
        if (!name) break;
        slotPokemon[slot] = name;
        delete lastAttacker[slot];
        const player = getPlayer(slot);
        if (player === "p1") { p1Selected.add(name); ensureStats("p1", name); }
        if (player === "p2") { p2Selected.add(name); ensureStats("p2", name); }
        break;
      }

      case "move": {
        // |move|p2b: Carl|Flare Blitz|p1b: Vespula
        const attackerSlot = extractSlot(parts[2] ?? "");
        const targetSlot = extractSlot(parts[4] ?? "");
        if (!attackerSlot) break;
        currentMover = attackerSlot;
        if (targetSlot && targetSlot !== attackerSlot) {
          lastAttacker[targetSlot] = attackerSlot;
        }
        break;
      }

      case "-damage": {
        // |-damage|p1b: Vespula|64/100
        // |-damage|p2b: Mongo|74/100|[from] item: Life Orb  <- indirect, skip
        const slot = extractSlot(parts[2] ?? "");
        if (!slot) break;
        // Any part after HP value containing "[from]" means indirect damage
        const hasFrom = parts.slice(4).some((p) => p.startsWith("[from]"));
        if (!hasFrom && currentMover && currentMover !== slot) {
          lastAttacker[slot] = currentMover;
        }
        break;
      }

      case "faint": {
        // |faint|p1b: Vespula
        const slot = extractSlot(parts[2] ?? "");
        if (!slot) break;
        const deadPokemon = slotPokemon[slot];
        if (!deadPokemon) break;
        const deadPlayer = getPlayer(slot);
        if (!deadPlayer) break;

        ensureStats(deadPlayer, deadPokemon);
        if (deadPlayer === "p1") result.p1Stats[deadPokemon].deaths += 1;
        else result.p2Stats[deadPokemon].deaths += 1;

        const killerSlot = lastAttacker[slot];
        if (killerSlot) {
          const killerPokemon = slotPokemon[killerSlot];
          if (killerPokemon) {
            const killerPlayer = getPlayer(killerSlot);
            if (killerPlayer) {
              ensureStats(killerPlayer, killerPokemon);
              if (killerPlayer === "p1") result.p1Stats[killerPokemon].kills += 1;
              else result.p2Stats[killerPokemon].kills += 1;
            }
          }
        }
        delete lastAttacker[slot];
        break;
      }

      case "win": {
        // |win|McFeeds
        const winnerUsername = parts[2];
        if (winnerUsername === result.p1Username) result.winner = "p1";
        else if (winnerUsername === result.p2Username) result.winner = "p2";
        break;
      }
    }
  }

  result.p1Selected = [...p1Selected];
  result.p2Selected = [...p2Selected];

  return result;
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\s]+/g, "-")
    .replace(/\.+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
