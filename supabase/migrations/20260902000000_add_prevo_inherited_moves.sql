-- ============================================================
-- Add moves that evolved Pokemon can inherit from a pre-evolution
-- (e.g. Grookey learns Fake Out as an egg move; that move carries
-- through evolution into Thwackey and Rillaboom even though Pokemon
-- Showdown's own learnsets.ts only lists it on Grookey's entry).
--
-- The seeding pipeline (supabase/scripts/seed_pokemon.py) previously
-- only checked a Pokemon's own species entry, missing every move that
-- is only listed on an earlier stage in its evolution line. Fixed at
-- the source in get_learnable_slugs (now walks the full prevo chain
-- via PokeAPI evolution-chain data), and this migration is the
-- one-time catch-up for the 756 Pokemon already seeded before that
-- fix. Generated from a full DB-wide diff against live Showdown data
-- (base + Champions mod learnsets) -- purely additive, zero removals.
-- ============================================================

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'aromatherapy' AND p.id IN (2740, 2809, 2810, 3245)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'belly-drum' AND p.id IN (2886, 2887, 2978, 3018, 3097, 3112, 3127, 3141, 3171, 3276, 3293)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'circle-throw' AND p.id IN (2932, 3159)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'clear-smog' AND p.id IN (2900, 2953, 2954, 3058, 3077, 3123)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'defog' AND p.id IN (2877, 2878, 2952, 3123, 3157, 3185, 3232, 3274, 3297)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'dragon-tail' AND p.id IN (3210)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'encore' AND p.id IN (2608, 2663, 3014, 3304)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'fake-out' AND p.id IN (3027, 3046, 3069, 3136, 3137, 3147, 3149, 3155, 3194, 3222, 3308)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'flip-turn' AND p.id IN (2894)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'follow-me' AND p.id IN (3112, 3124, 3127, 3128)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'haze' AND p.id IN (3164, 3228, 3270)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'heal-bell' AND p.id IN (3006, 3013)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'healing-wish' AND p.id IN (3111, 3150, 3245)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'icy-wind' AND p.id IN (2607, 2881, 3014)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'knock-off' AND p.id IN (2607, 2775, 2776, 2777, 2930, 2992, 3107, 3126, 3140, 3157, 3164, 3177, 3179, 3198, 3237, 3301)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'parting-shot' AND p.id IN (2941, 3167, 3194, 3212)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'quick-guard' AND p.id IN (2849, 2930, 2952, 3119, 3137)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'rage-powder' AND p.id IN (3033, 3116, 3125, 3196, 3361)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'rapid-spin' AND p.id IN (3116, 3126, 3161, 3193, 3198, 3207)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'reflect' AND p.id IN (2646, 2647, 2933)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'shell-smash' AND p.id IN (3202, 3205, 3227)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'snarl' AND p.id IN (2607, 2881)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'snowscape' AND p.id IN (2607, 3014)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'sticky-web' AND p.id IN (3032, 3260, 3263, 3303)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'taunt' AND p.id IN (2627, 2754, 2855)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'teleport' AND p.id IN (2620, 2629, 2655, 2656, 2665, 2707, 2708, 2709, 2849)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'thunder-wave' AND p.id IN (2881, 2894, 3042)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'u-turn' AND p.id IN (2611, 2933)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'whirlwind' AND p.id IN (2878, 2901, 3105, 3159, 3184, 3191, 3246, 3353, 3399)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'wide-guard' AND p.id IN (2849, 2921, 2928, 3078, 3146, 3179, 3252, 3253, 3297)
ON CONFLICT DO NOTHING;

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE m.slug = 'wish' AND p.id IN (2875, 2876, 2937, 3069, 3149, 3274)
ON CONFLICT DO NOTHING;
