-- ============================================================
-- Add 5 pokemon requested by the admin, with point values:
--   Zygarde (50% Forme) - 19   [note: Zygarde-10 already exists as its
--                                own row at 10 pts; this is the separate,
--                                default/standard 50% Forme]
--   Shuckle - 8
--   Poltchageist (Counterfeit Form; Artisan Form is stat-identical) - 7
--   Torchic - 1
--   Treecko - 1
--
-- Stats/types/abilities verified against PokemonDB. Ability naming matches
-- this DB's existing lowercase-hyphenated convention (e.g. "sand-stream").
-- Move links use only entries already in important_moves, matching moves
-- each species can legally learn. Zygarde's moves mirror the already-seeded
-- Zygarde-10 row exactly, since this league's forms share one learnset per
-- species (see get_learnable_slugs in supabase/scripts/seed_pokemon.py).
-- ============================================================

INSERT INTO pokemon (dex_number, name, slug, type_1, type_2, ability_1, ability_2, hidden_ability, hp, atk, def, spa, spd, spe, point_value)
VALUES
  (718,  'Zygarde',      'zygarde',      'dragon', 'ground', 'aura-break', NULL,        'power-construct', 108, 100, 121, 81, 95, 95, 19),
  (213,  'Shuckle',      'shuckle',      'bug',    'rock',   'sturdy',     'gluttony',  'contrary',         20,  10, 230, 10, 230, 5,  8),
  (1012, 'Poltchageist', 'poltchageist', 'grass',  'ghost',  'hospitality', NULL,       'heatproof',        40,  45,  45, 74,  54, 50, 7),
  (255,  'Torchic',      'torchic',      'fire',   NULL,     'blaze',      NULL,        'speed-boost',      45,  60,  40, 70,  50, 45, 1),
  (252,  'Treecko',      'treecko',      'grass',  NULL,     'overgrow',   NULL,        'unburden',         40,  45,  35, 65,  55, 70, 1)
ON CONFLICT (slug) DO NOTHING;

-- Zygarde: same learnset as the existing Zygarde-10 row (forms share one
-- species-level learnset).
INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'zygarde' AND m.name IN ('Haze', 'Breaking Swipe', 'Sunny Day', 'Sandstorm', 'Dragon Dance')
ON CONFLICT DO NOTHING;

-- Shuckle: signature competitive set pieces (Stealth Rock, Sticky Web,
-- Trick Room support; Knock Off/Encore utility).
INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'shuckle' AND m.name IN ('Stealth Rock', 'Knock Off', 'Encore', 'Sticky Web', 'Trick Room')
ON CONFLICT DO NOTHING;

-- Poltchageist: Calm Mind / Nasty Plot setup + Trick Room / Rage Powder /
-- Imprison / Reflect support, matching its Sinistcha-line support identity.
INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'poltchageist' AND m.name IN ('Calm Mind', 'Imprison', 'Nasty Plot', 'Rage Powder', 'Reflect', 'Trick Room')
ON CONFLICT DO NOTHING;

-- Torchic
INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'torchic' AND m.name IN ('Sunny Day', 'Swords Dance', 'Will-O-Wisp')
ON CONFLICT DO NOTHING;

-- Treecko
INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'treecko' AND m.name IN ('Breaking Swipe', 'Dragon Tail', 'Quick Guard', 'Swords Dance', 'Sunny Day', 'Upper Hand')
ON CONFLICT DO NOTHING;
