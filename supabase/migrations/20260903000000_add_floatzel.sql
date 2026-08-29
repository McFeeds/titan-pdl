-- ============================================================
-- Add Floatzel at 11 points.
--
-- Stats/types/abilities and moveset computed directly from PokeAPI +
-- live Pokemon Showdown learnset data (base + Champions mod, with
-- prevo-chain inheritance) via supabase/scripts/seed_pokemon.py's
-- get_learnable_slugs -- not hand-guessed.
-- ============================================================

INSERT INTO pokemon (dex_number, name, slug, type_1, type_2, ability_1, ability_2, hidden_ability, hp, atk, def, spa, spd, spe, point_value)
VALUES
  (419, 'Floatzel', 'floatzel', 'water', NULL, 'swift-swim', 'water-veil', 'water-veil', 85, 105, 55, 85, 50, 115, 11)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'floatzel' AND m.slug IN ('bulk-up', 'flip-turn', 'ice-spinner', 'icy-wind', 'rain-dance', 'roar', 'snarl', 'taunt')
ON CONFLICT DO NOTHING;
