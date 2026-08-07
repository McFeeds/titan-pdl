#!/usr/bin/env python3
"""
Rebuild important_moves and pokemon_moves for every pokemon in the DB, from
the current important-moves.txt.

Every pokemon (including megas, regional forms, and other variants) is
matched against its national-dex (base species) moveset only -- never a
form-specific one -- per league rules. This is a full recompute: every
pokemon with real PokeAPI data gets its pokemon_moves links rebuilt from
scratch, so this also fixes any pokemon that fell through earlier partial
runs.

Requirements:
  pip install -r supabase/scripts/requirements.txt

Environment variables (or a .env / .env.local in the project root):
  SUPABASE_URL         — your project URL
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS for writes)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from seed_pokemon import (  # noqa: E402
    MOVES_FILE,
    BATCH_SIZE,
    parse_moves_file,
    name_to_slug,
    fetch_pokemon,
    fetch_showdown_learnsets,
    get_learnable_slugs,
    insert_batched,
)

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parents[2] / ".env.local")
    load_dotenv(Path(__file__).parents[2] / ".env")
except ImportError:
    pass

try:
    from supabase import create_client, Client
except ImportError:
    sys.exit("Run: pip install -r supabase/scripts/requirements.txt")


def main() -> None:
    supabase_url = __import__("os").environ.get("SUPABASE_URL") or __import__("os").environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = __import__("os").environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        sys.exit("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY.")

    supabase: Client = create_client(supabase_url, supabase_key)

    if not MOVES_FILE.exists():
        sys.exit(f"File not found: {MOVES_FILE}")

    move_pairs = parse_moves_file(MOVES_FILE)  # [(display_name, slug), ...]
    move_slugs = {slug for _, slug in move_pairs}
    print(f"Loaded {len(move_pairs)} important moves from {MOVES_FILE.name}")

    # ------------------------------------------------------------------
    # 1. Sync important_moves: insert new ones, remove ones no longer listed
    #    (pokemon_moves cascades on delete, so this cleans up stale links too).
    # ------------------------------------------------------------------
    existing_moves = supabase.table("important_moves").select("id, name, slug").execute().data
    existing_by_slug = {m["slug"]: m for m in existing_moves}
    file_slugs = {slug for _, slug in move_pairs}

    to_insert = [{"name": n, "slug": s} for n, s in move_pairs if s not in existing_by_slug]
    to_delete_ids = [m["id"] for m in existing_moves if m["slug"] not in file_slugs]

    if to_insert:
        print(f"Inserting {len(to_insert)} new important moves...")
        insert_batched(supabase, "important_moves", to_insert)
    if to_delete_ids:
        print(f"Removing {len(to_delete_ids)} important moves no longer in the file...")
        supabase.table("important_moves").delete().in_("id", to_delete_ids).execute()
    print("  Done.\n")

    move_id_map = {
        m["slug"]: m["id"]
        for m in supabase.table("important_moves").select("id, slug").execute().data
    }

    # ------------------------------------------------------------------
    # 2. Fetch every real (non-placeholder) pokemon and compute its
    #    national-dex moveset.
    # ------------------------------------------------------------------
    print("Fetching Showdown learnsets...")
    base_learnsets, champions_learnsets = fetch_showdown_learnsets()

    all_pokemon = (
        supabase.table("pokemon")
        .select("id, name, slug, dex_number")
        .execute()
        .data
    )
    real_pokemon = [p for p in all_pokemon if p["dex_number"] is not None]
    placeholder_pokemon = [p for p in all_pokemon if p["dex_number"] is None]
    print(f"{len(real_pokemon)} pokemon with real PokeAPI data, {len(placeholder_pokemon)} placeholders (skipped, no learnset data available)\n")

    junction_rows: list[dict] = []
    no_learnset: list[str] = []

    for i, p in enumerate(real_pokemon, 1):
        # Resolve via name_to_slug (which checks SLUG_OVERRIDES) rather than
        # the stored slug column directly, so a fix like an upstream PokeAPI
        # slug rename takes effect without needing to touch stored data.
        fetch_slug = name_to_slug(p["name"])
        try:
            api_data = fetch_pokemon(fetch_slug)
        except Exception as e:
            print(f"  [ERROR] {p['name']} ({fetch_slug}): {e} — skipping")
            continue

        if api_data is None:
            print(f"  [WARN] {p['name']} ({fetch_slug}) no longer resolves via PokeAPI — skipping")
            continue

        learnable, is_form = get_learnable_slugs(api_data, base_learnsets, champions_learnsets, move_slugs)
        if not learnable:
            no_learnset.append(p["name"])

        for move_slug in learnable:
            move_id = move_id_map.get(move_slug)
            if move_id is None:
                continue
            junction_rows.append({"pokemon_id": p["id"], "move_id": move_id})

        if i % 50 == 0 or i == len(real_pokemon):
            print(f"  {i}/{len(real_pokemon)}")

    print(f"\nComputed {len(junction_rows)} pokemon<->move links.")

    # ------------------------------------------------------------------
    # 3. Full rebuild of pokemon_moves.
    # ------------------------------------------------------------------
    print("\nClearing existing pokemon_moves...")
    supabase.table("pokemon_moves").delete().gte("pokemon_id", 0).execute()
    print("  Done.")

    print(f"Inserting {len(junction_rows)} pokemon<->move links...")
    insert_batched(supabase, "pokemon_moves", junction_rows)
    print("  Done.\n")

    print("=" * 55)
    print(f"Important moves: {len(to_insert)} added, {len(to_delete_ids)} removed, {len(move_id_map)} total")
    print(f"Pokemon processed: {len(real_pokemon)} (skipped {len(placeholder_pokemon)} placeholders)")
    print(f"Pokemon<->move links inserted: {len(junction_rows)}")
    if no_learnset:
        print(f"\nPokemon with zero important moves matched ({len(no_learnset)}):")
        for n in no_learnset:
            print(f"  - {n}")
    print("=" * 55)


if __name__ == "__main__":
    main()
