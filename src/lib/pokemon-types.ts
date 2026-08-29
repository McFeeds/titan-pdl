export const TYPE_COLORS: Record<string, string> = {
  Normal: "#A8A878", Fire: "#F08030", Water: "#6890F0", Electric: "#F8D030",
  Grass: "#78C850", Ice: "#98D8D8", Fighting: "#C03028", Poison: "#A040A0",
  Ground: "#E0C068", Flying: "#A890F0", Psychic: "#F85888", Bug: "#A8B820",
  Rock: "#B8A038", Ghost: "#705898", Dragon: "#7038F8", Dark: "#705848",
  Steel: "#B8B8D0", Fairy: "#EE99AC",
};

// Lowercase keys for easy lookup from DB values
export const TYPE_CHART: Record<string, Record<string, number>> = {
  normal:   { rock: 0.5, ghost: 0, steel: 0.5 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug:      { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock:     { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel:    { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy:    { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

// Title-cased names in dex order, used for type chart columns
export const ATTACKING_TYPES = [
  "Normal","Fire","Water","Electric","Grass","Ice",
  "Fighting","Poison","Ground","Flying","Psychic","Bug",
  "Rock","Ghost","Dragon","Dark","Steel","Fairy",
] as const;

export type AttackingType = typeof ATTACKING_TYPES[number];

// Lowercase list derived from TYPE_COLORS, used for search filters
export const POKEMON_TYPES = Object.keys(TYPE_COLORS).map((t) => t.toLowerCase());

export function getEffectiveness(atk: string, def1: string, def2?: string | null): number {
  const row = TYPE_CHART[atk.toLowerCase()] ?? {};
  return (row[def1.toLowerCase()] ?? 1) * (def2 ? (row[def2.toLowerCase()] ?? 1) : 1);
}

// Ability modifiers: multiplier is applied on top of the base type effectiveness.
// 0 = immunity, <1 = damage reduction, >1 = damage boost.
const ABILITY_TYPE_MODS: Record<string, { type: string; multiplier: number }[]> = {
  "levitate":        [{ type: "ground",   multiplier: 0 }],
  "flash-fire":      [{ type: "fire",     multiplier: 0 }],
  "water-absorb":    [{ type: "water",    multiplier: 0 }],
  "volt-absorb":     [{ type: "electric", multiplier: 0 }],
  "storm-drain":     [{ type: "water",    multiplier: 0 }],
  "lightning-rod":   [{ type: "electric", multiplier: 0 }],
  "sap-sipper":      [{ type: "grass",    multiplier: 0 }],
  "motor-drive":     [{ type: "electric", multiplier: 0 }],
  "earth-eater":     [{ type: "ground",   multiplier: 0 }],
  "well-baked-body": [{ type: "fire",     multiplier: 0 }],
  "heatproof":       [{ type: "fire",     multiplier: 0.5 }],
  "thick-fat":       [{ type: "fire",     multiplier: 0.5 }, { type: "ice", multiplier: 0.5 }],
  "water-bubble":    [{ type: "fire",     multiplier: 0.5 }],
  "purifying-salt":  [{ type: "ghost",    multiplier: 0.5 }],
  // Dry Skin: absorbs Water, but Fire deals 25% more damage
  "dry-skin":        [{ type: "water",    multiplier: 0 }, { type: "fire", multiplier: 1.25 }],
  // Fluffy: contact moves deal half damage, but Fire moves deal double
  "fluffy":          [{ type: "fire",     multiplier: 2 }],
};

// Filter, Prism Armor, and Solid Rock reduce all super-effective damage by ×0.75.
// Handled separately since they apply to any type where effectiveness > 1.
const SUPER_EFFECTIVE_REDUCERS = new Set(["filter", "prism-armor", "solid-rock"]);

export function getEffectivenessWithAbilities(
  atk: string,
  def1: string,
  def2: string | null | undefined,
  abilities: (string | null | undefined)[],
): number {
  let e = getEffectiveness(atk, def1, def2);
  const atkLower = atk.toLowerCase();
  for (const ability of abilities) {
    if (!ability) continue;
    const abilityLower = ability.toLowerCase();
    if (SUPER_EFFECTIVE_REDUCERS.has(abilityLower)) {
      if (e > 1) e *= 0.75;
      continue;
    }
    const mods = ABILITY_TYPE_MODS[abilityLower];
    if (!mods) continue;
    for (const mod of mods) {
      if (mod.type === atkLower) e *= mod.multiplier;
    }
  }
  return e;
}

export function typeColor(type: string): string {
  const key = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return TYPE_COLORS[key] ?? "#6b7280";
}
