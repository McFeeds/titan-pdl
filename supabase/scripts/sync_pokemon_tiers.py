#!/usr/bin/env python3
"""
Sync the pokemon table's point values from pokemon-tiering.txt, additively.

Unlike seed_pokemon.py (which wipes and rebuilds the whole pokemon table from
scratch), this script never deletes anything:

  1. Every existing pokemon's point_value is zeroed (banned) first.
  2. For each pokemon-tiering.txt entry:
       - If it matches an existing row (by slug), its point_value is updated.
       - If it doesn't exist yet, it's fetched from PokeAPI (stats/types/
         abilities) and Pokemon Showdown (learnable important moves) and
         inserted as a new row.
  3. Any existing pokemon never mentioned in pokemon-tiering.txt is left at
     point_value = 0 (banned) from step 1 — nothing is ever deleted.

pokemon-tiering.txt format: name<TAB>[optional middle column, ignored]<TAB>points
The point value is always read from the LAST tab-separated column. A value
of 0 means banned.

Requirements:
  pip install -r supabase/scripts/requirements.txt

Environment variables (or a .env / .env.local in the project root):
  SUPABASE_URL         — your project URL
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS for writes)

Usage:
  python supabase/scripts/sync_pokemon_tiers.py            # full run
  python supabase/scripts/sync_pokemon_tiers.py --limit 10 # only process the
                                                             # first N new
                                                             # (not-yet-in-DB)
                                                             # entries, for a
                                                             # quick smoke test
"""

import argparse
import os
import sys
from pathlib import Path

from pathlib import Path as _Path
sys.path.insert(0, str(_Path(__file__).parent))

from seed_pokemon import (  # noqa: E402
    TIERING_FILE,
    MOVES_FILE,
    BATCH_SIZE,
    name_to_slug,
    parse_moves_file,
    fetch_pokemon,
    build_pokemon_row_from_api,
    build_placeholder_row,
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


# pokemon-tiering.txt display name -> existing DB slug, for cases where the
# tiering file's naming doesn't mechanically slug-match an already-seeded
# row (different abbreviation/suffix convention), so these update the
# existing row instead of creating a duplicate for the same real Pokemon.
NAME_TO_EXISTING_SLUG: dict[str, str] = {
    "Indeedee-F":         "indeedee-female",
    "Meowstic-F":         "meowstic-female",
    "Tauros-Paldea-Aqua": "tauros-paldea-aqua-breed",
    "Tauros-Paldea-Blaze": "tauros-paldea-blaze-breed",
    "Tauros-Paldea":      "tauros-paldea-combat-breed",
    "Lycanroc":           "lycanroc-midday",
    "Typhlsion-Hisui":    "typhlosion-hisui",  # typo in pokemon-tiering.txt
}


def parse_tiering_file(path: Path) -> list[tuple[str, int]]:
    """Returns [(name, point_value), ...]. Reads the LAST tab-separated
    column as the point value, so this works for both the old 2-column
    format and the current 3-column format (name / ban-flag / points)."""
    entries: list[tuple[str, int]] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip("\n")
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            print(f"  [WARN] Line {line_no}: unexpected format — {raw!r}")
            continue
        name, pts = parts[0].strip(), parts[-1].strip()
        try:
            entries.append((name, int(pts)))
        except ValueError:
            print(f"  [WARN] Line {line_no}: non-integer points '{pts}' — skipping")
    return entries


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="Only process the first N new (not-yet-in-DB) entries — for smoke testing.")
    args = ap.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        sys.exit("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY.")

    supabase: Client = create_client(supabase_url, supabase_key)

    for f in (TIERING_FILE, MOVES_FILE):
        if not f.exists():
            sys.exit(f"File not found: {f}")

    entries = parse_tiering_file(TIERING_FILE)
    print(f"Loaded {len(entries)} entries from {TIERING_FILE.name}")

    # Two different display names can still slug down to the same real
    # Pokemon (e.g. "Ting Lu" / "Ting-Lu") -- dedupe by resolved slug,
    # keeping the LAST occurrence (matches how conflicting entries in this
    # file have been resolved so far: the later line wins). This also
    # guarantees to_insert_entries can never contain the same slug twice,
    # which would otherwise crash the final insert on a unique-constraint
    # violation. Differing values are reported, not silently dropped.
    by_slug: dict[str, tuple[str, int]] = {}
    conflicts = []
    for name, pts in entries:
        slug = NAME_TO_EXISTING_SLUG.get(name) or name_to_slug(name)
        if slug in by_slug and by_slug[slug][1] != pts:
            conflicts.append((by_slug[slug][0], by_slug[slug][1], name, pts))
        by_slug[slug] = (name, pts)
    if conflicts:
        print("\n[WARN] Conflicting duplicate entries for the same Pokemon (using the later value):")
        for old_name, old_pts, new_name, new_pts in conflicts:
            print(f"  {old_name!r} ({old_pts}) -> {new_name!r} ({new_pts})")
    entries = list(by_slug.values())

    _, move_slugs_pairs = None, parse_moves_file(MOVES_FILE)
    move_slugs = {slug for _, slug in move_slugs_pairs}

    print("Fetching existing pokemon from DB...")
    db_pokemon = supabase.table("pokemon").select("id, name, slug, point_value").execute().data
    existing_by_slug = {p["slug"]: p for p in db_pokemon}
    print(f"  {len(db_pokemon)} existing rows")

    print("\nZeroing point_value for every existing pokemon (banned by default)...")
    supabase.table("pokemon").update({"point_value": 0}).gte("id", 0).execute()
    print("  Done.")

    to_update: list[tuple[int, str, int]] = []   # (id, name, new_point_value)
    to_insert_entries: list[tuple[str, int]] = []  # (name, point_value) not yet in DB
    touched_slugs: set[str] = set()

    for name, points in entries:
        slug = NAME_TO_EXISTING_SLUG.get(name) or name_to_slug(name)
        row = existing_by_slug.get(slug)
        if row is not None:
            to_update.append((row["id"], name, points))
            touched_slugs.add(slug)
        else:
            to_insert_entries.append((name, points))

    if args.limit is not None:
        to_insert_entries = to_insert_entries[: args.limit]
        print(f"\n[--limit {args.limit}] Only processing the first {len(to_insert_entries)} new entries this run.")

    print(f"\n{len(to_update)} existing pokemon to update, {len(to_insert_entries)} new pokemon to insert.")

    print("\nUpdating point values for existing pokemon...")
    for i, (pid, name, points) in enumerate(to_update, 1):
        supabase.table("pokemon").update({"point_value": points}).eq("id", pid).execute()
        if i % 50 == 0 or i == len(to_update):
            print(f"  {i}/{len(to_update)}")
    print("  Done.")

    if not to_insert_entries:
        print("\nNo new pokemon to insert. Done.")
        return

    print(f"\nFetching Showdown learnsets for {len(to_insert_entries)} new pokemon...")
    base_learnsets, champions_learnsets = fetch_showdown_learnsets()

    print("Fetching new pokemon from PokeAPI...")
    new_rows: list[dict] = []
    placeholder_names: list[str] = []
    learnable_map: dict[str, set[str]] = {}

    for display_name, point_value in to_insert_entries:
        slug = NAME_TO_EXISTING_SLUG.get(display_name) or name_to_slug(display_name)
        try:
            api_data = fetch_pokemon(slug)
        except Exception as e:
            # A single bad slug (unexpected PokeAPI response, network hiccup,
            # etc.) shouldn't take down a run that's already fetched hundreds
            # of entries — fall back to a placeholder and keep going.
            print(f"  [ERROR] {display_name} ({slug}): {e} — inserting as placeholder")
            api_data = None
        if api_data is not None:
            row = build_pokemon_row_from_api(api_data, display_name, point_value)
            learnable, is_form = get_learnable_slugs(api_data, base_learnsets, champions_learnsets, move_slugs)
            learnable_map[slug] = learnable
            label = "FORM        " if is_form else "OK          "
            print(f"  {label}{display_name}")
        else:
            print(f"  PLACEHOLDER {display_name}  (not in PokeAPI — stats need manual entry)")
            row = build_placeholder_row(display_name, point_value)
            placeholder_names.append(display_name)
        new_rows.append(row)

        # Flush periodically so a crash later in the loop doesn't lose
        # already-fetched progress — each flushed row won't be re-inserted
        # on a re-run since it'll show up as "existing" next time.
        if len(new_rows) >= BATCH_SIZE:
            insert_batched(supabase, "pokemon", new_rows)
            new_rows = []

    print(f"\nInserting remaining {len(new_rows)} new pokemon rows...")
    insert_batched(supabase, "pokemon", new_rows)
    print("  Done.")

    print("\nLinking new pokemon to important moves...")
    db_pokemon_after = supabase.table("pokemon").select("id, slug").execute().data
    db_moves = supabase.table("important_moves").select("id, slug").execute().data
    pokemon_id_map = {p["slug"]: p["id"] for p in db_pokemon_after}
    move_id_map = {m["slug"]: m["id"] for m in db_moves}

    junction_rows: list[dict] = []
    for poke_slug, learnable in learnable_map.items():
        pokemon_id = pokemon_id_map.get(poke_slug)
        if pokemon_id is None:
            continue
        for move_slug in learnable:
            move_id = move_id_map.get(move_slug)
            if move_id is None:
                continue
            junction_rows.append({"pokemon_id": pokemon_id, "move_id": move_id})

    print(f"Inserting {len(junction_rows)} pokemon<->move links...")
    insert_batched(supabase, "pokemon_moves", junction_rows)
    print("  Done.")

    print("\n" + "=" * 55)
    print(f"Updated existing pokemon : {len(to_update)}")
    print(f"Inserted new pokemon     : {len(new_rows)}")
    print(f"  from PokeAPI           : {len(new_rows) - len(placeholder_names)}")
    print(f"  placeholders (manual)  : {len(placeholder_names)}")
    print(f"New pokemon<->move links : {len(junction_rows)}")
    if placeholder_names:
        print(f"\nPlaceholders needing manual stat entry ({len(placeholder_names)}):")
        for n in placeholder_names:
            print(f"  - {n}")
    print("=" * 55)


if __name__ == "__main__":
    main()
