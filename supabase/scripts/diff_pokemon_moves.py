#!/usr/bin/env python3
"""
Read-only diff between the live pokemon_moves table and what Pokemon
Showdown's national-dex learnset data (base + Champions mod) says each
Pokemon should be able to learn, restricted to important-moves.txt.

Makes NO writes. Prints a summary and writes a full diff to
diff_pokemon_moves_output.txt for review before applying anything.

Requirements/env vars: same as seed_pokemon.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from seed_pokemon import (  # noqa: E402
    MOVES_FILE,
    parse_moves_file,
    name_to_slug,
    fetch_pokemon,
    fetch_showdown_learnsets,
    get_learnable_slugs,
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
    import os
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        sys.exit("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY.")

    supabase: Client = create_client(supabase_url, supabase_key)

    move_pairs = parse_moves_file(MOVES_FILE)
    move_slugs = {slug for _, slug in move_pairs}
    move_id_by_slug = {
        m["slug"]: m["id"]
        for m in supabase.table("important_moves").select("id, slug").execute().data
    }
    move_slug_by_id = {v: k for k, v in move_id_by_slug.items()}

    def fetch_all(table: str, columns: str) -> list[dict]:
        """Paginate past the client's default 1000-row cap."""
        rows: list[dict] = []
        page_size = 1000
        start = 0
        while True:
            resp = supabase.table(table).select(columns).range(start, start + page_size - 1).execute()
            rows.extend(resp.data)
            if len(resp.data) < page_size:
                break
            start += page_size
        return rows

    all_pokemon = fetch_all("pokemon", "id, name, slug, dex_number")
    real_pokemon = [p for p in all_pokemon if p["dex_number"] is not None]
    print(f"{len(real_pokemon)} real pokemon, {len(all_pokemon) - len(real_pokemon)} placeholders (skipped)\n")

    # Current live links: pokemon_id -> set(move slug)
    existing_links = fetch_all("pokemon_moves", "pokemon_id, move_id")
    print(f"Loaded {len(existing_links)} existing pokemon_moves links\n")
    current_by_pokemon: dict[int, set[str]] = {}
    for row in existing_links:
        slug = move_slug_by_id.get(row["move_id"])
        if slug is None:
            continue
        current_by_pokemon.setdefault(row["pokemon_id"], set()).add(slug)

    print("Fetching Showdown learnsets...")
    base_learnsets, champions_learnsets = fetch_showdown_learnsets()

    additions: list[tuple[int, str, str]] = []   # (pokemon_id, name, move_slug) to ADD
    removals: list[tuple[int, str, str]] = []     # (pokemon_id, name, move_slug) to REMOVE
    errors: list[str] = []

    for i, p in enumerate(real_pokemon, 1):
        fetch_slug = name_to_slug(p["name"])
        try:
            api_data = fetch_pokemon(fetch_slug)
        except Exception as e:
            errors.append(f"{p['name']} ({fetch_slug}): {e}")
            continue
        if api_data is None:
            errors.append(f"{p['name']} ({fetch_slug}): no longer resolves via PokeAPI")
            continue

        correct, _is_form = get_learnable_slugs(api_data, base_learnsets, champions_learnsets, move_slugs)
        current = current_by_pokemon.get(p["id"], set())

        for slug in sorted(correct - current):
            additions.append((p["id"], p["name"], slug))
        for slug in sorted(current - correct):
            removals.append((p["id"], p["name"], slug))

        if i % 100 == 0 or i == len(real_pokemon):
            print(f"  {i}/{len(real_pokemon)}")

    affected_pokemon = {n for _, n, _ in additions} | {n for _, n, _ in removals}

    print("\n" + "=" * 60)
    print(f"Pokemon with any diff : {len(affected_pokemon)} / {len(real_pokemon)}")
    print(f"Links to ADD          : {len(additions)}")
    print(f"Links to REMOVE       : {len(removals)}")
    print(f"PokeAPI errors        : {len(errors)}")
    print("=" * 60)

    out_path = Path(__file__).parent / "diff_pokemon_moves_output.txt"
    with out_path.open("w", encoding="utf-8") as f:
        f.write(f"Pokemon with any diff: {len(affected_pokemon)} / {len(real_pokemon)}\n")
        f.write(f"Links to ADD: {len(additions)}\n")
        f.write(f"Links to REMOVE: {len(removals)}\n\n")

        f.write("=== ADDITIONS (pokemon_id, name, move_slug) ===\n")
        for pid, name, slug in additions:
            f.write(f"{pid}\t{name}\t{slug}\n")

        f.write("\n=== REMOVALS (pokemon_id, name, move_slug) ===\n")
        for pid, name, slug in removals:
            f.write(f"{pid}\t{name}\t{slug}\n")

        if errors:
            f.write("\n=== ERRORS ===\n")
            for e in errors:
                f.write(f"{e}\n")

    print(f"\nFull diff written to {out_path}")


if __name__ == "__main__":
    main()
