-- ============================================================
-- Add Sneasel-Hisui at 9 points.
--
-- Stats/types/abilities and moveset computed directly from PokeAPI +
-- live Pokemon Showdown learnset data (base + Champions mod, with
-- prevo-chain inheritance) via supabase/scripts/seed_pokemon.py's
-- get_learnable_slugs -- not hand-guessed. Base Sneasel and Sneasler
-- already exist in the DB as separate rows; this is the Hisuian
-- regional form, distinct from both.
-- ============================================================

INSERT INTO pokemon (dex_number, name, slug, type_1, type_2, ability_1, ability_2, hidden_ability, hp, atk, def, spa, spd, spe, point_value)
VALUES
  (10235, 'Sneasel-Hisui', 'sneasel-hisui', 'fighting', 'poison', 'inner-focus', 'keen-eye', 'pickpocket', 55, 95, 55, 35, 75, 115, 9)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'sneasel-hisui' AND m.slug IN ('calm-mind', 'fake-out', 'icy-wind', 'knock-off', 'nasty-plot', 'rain-dance', 'snarl', 'snowscape', 'sunny-day', 'swords-dance', 'taunt', 'upper-hand')
ON CONFLICT DO NOTHING;
