#!/usr/bin/env python3
"""
Seed the Supabase pokemon, important_moves, and pokemon_moves tables.

Data sources:
  - Point values        : pokemon-tiering.txt   (tab-separated: name<TAB>points)
  - Curated move list   : important-moves.txt   (one move name per line)
  - Types/abilities/stats/learnsets : PokeAPI (https://pokeapi.co)

For Pokemon forms that exist in PokeAPI (megas, regionals, etc.) the script
fetches their actual stats and abilities.  For custom forms invented by the
league that are NOT in PokeAPI, a placeholder row is inserted with zeroed
stats so the entry exists with the correct slug and point value — those rows
are printed at the end so you know which ones need manual stat entry.

Requirements:
  pip install -r supabase/scripts/requirements.txt

Environment variables (or a .env / .env.local in the project root):
  SUPABASE_URL         — your project URL
  SUPABASE_SERVICE_KEY — service-role key (bypasses RLS for writes)
"""

import os
import re
import sys
import time
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parents[2] / ".env.local")
    load_dotenv(Path(__file__).parents[2] / ".env")
except ImportError:
    pass  # python-dotenv is optional

try:
    from supabase import create_client, Client
except ImportError:
    sys.exit("Run: pip install -r supabase/scripts/requirements.txt")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TIERING_FILE     = Path(__file__).parent / "pokemon-tiering.txt"
MOVES_FILE       = Path(__file__).parent / "important-moves.txt"
POKEAPI_BASE     = "https://pokeapi.co/api/v2"
REQUEST_DELAY    = 0.25   # seconds between PokeAPI requests
BATCH_SIZE       = 50     # rows per Supabase upsert


# ---------------------------------------------------------------------------
# Name → PokeAPI slug
# ---------------------------------------------------------------------------

# Overrides for names that can't be mechanically lowercased + hyphenated.
SLUG_OVERRIDES: dict[str, str] = {
    "Mr. Mime":           "mr-mime",
    "Mr. Mime-Galar":     "mr-mime-galar",
    "Mr. Rime":           "mr-rime",
    "Mime Jr.":           "mime-jr",
    "Farfetch'd":         "farfetchd",
    "Farfetch'd-Galar":   "farfetchd-galar",
    "Sirfetchd":          "sirfetchd",
    "PorygonZ":           "porygon-z",
    "Porygon2":           "porygon2",
    # Tauros-Paldea without a subtype → combat form is the default
    "Tauros-Paldea":      "tauros-paldea-combat",
    # PokeAPI's default basculegion is the female form
    "Basculegion-Female": "basculegion",
}


def name_to_slug(name: str) -> str:
    """Convert a display name from the tiering file to a URL-safe slug."""
    if name in SLUG_OVERRIDES:
        return SLUG_OVERRIDES[name]
    slug = name.lower()
    slug = re.sub(r"['.()]", "", slug)
    slug = slug.replace(" ", "-")
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def move_name_to_slug(name: str) -> str:
    """'Will-O-Wisp' → 'will-o-wisp', 'Fake Out' → 'fake-out'"""
    return name.strip().lower().replace(" ", "-")


# ---------------------------------------------------------------------------
# PokeAPI helpers
# ---------------------------------------------------------------------------

_api_cache: dict[str, dict | None] = {}


def fetch_pokemon(slug: str) -> dict | None:
    """Fetch /pokemon/{slug}; on 404 falls back to /pokemon-species/{slug} and
    fetches the default variety (handles multi-form Pokemon like Aegislash)."""
    if slug in _api_cache:
        return _api_cache[slug]

    resp = requests.get(f"{POKEAPI_BASE}/pokemon/{slug}", timeout=15)

    if resp.status_code == 404:
        species_resp = requests.get(f"{POKEAPI_BASE}/pokemon-species/{slug}", timeout=15)
        if species_resp.status_code == 404:
            _api_cache[slug] = None
            return None
        species_resp.raise_for_status()
        time.sleep(REQUEST_DELAY)

        varieties = species_resp.json().get("varieties", [])
        default_variety = next((v for v in varieties if v["is_default"]), varieties[0] if varieties else None)
        if default_variety is None:
            _api_cache[slug] = None
            return None

        resp = requests.get(default_variety["pokemon"]["url"], timeout=15)

    resp.raise_for_status()
    time.sleep(REQUEST_DELAY)

    data = resp.json()
    _api_cache[slug] = data
    return data


# ---------------------------------------------------------------------------
# Data extraction
# ---------------------------------------------------------------------------

PLACEHOLDER_STATS = dict(hp=0, atk=0, def_=0, spa=0, spd=0, spe=0)


def build_pokemon_row_from_api(
    api_data: dict, display_name: str, point_value: int
) -> dict:
    types = api_data["types"]
    type_1 = types[0]["type"]["name"]
    type_2 = types[1]["type"]["name"] if len(types) > 1 else None

    sorted_abilities = sorted(api_data["abilities"], key=lambda a: a["slot"])
    ability_1      = sorted_abilities[0]["ability"]["name"] if sorted_abilities else "unknown"
    ability_2      = sorted_abilities[1]["ability"]["name"] if len(sorted_abilities) > 1 else None
    hidden_ability = next((a["ability"]["name"] for a in sorted_abilities if a["is_hidden"]), None)

    stats = {s["stat"]["name"]: s["base_stat"] for s in api_data["stats"]}

    return {
        "dex_number":     api_data["id"],
        "name":           display_name,
        "slug":           name_to_slug(display_name),
        "type_1":         type_1,
        "type_2":         type_2,
        "ability_1":      ability_1,
        "ability_2":      ability_2,
        "hidden_ability": hidden_ability,
        "hp":             stats["hp"],
        "atk":            stats["attack"],
        "def":            stats["defense"],
        "spa":            stats["special-attack"],
        "spd":            stats["special-defense"],
        "spe":            stats["speed"],
        "point_value":    point_value,
    }


def build_placeholder_row(display_name: str, point_value: int) -> dict:
    """
    Row for a custom league form not in PokeAPI (e.g. Dragonite-Mega).
    Stats are zeroed — these must be filled in manually via the dashboard.
    """
    return {
        "dex_number":     None,   # NULL avoids UNIQUE conflicts with base form
        "name":           display_name,
        "slug":           name_to_slug(display_name),
        "type_1":         "normal",
        "type_2":         None,
        "ability_1":      "unknown",
        "ability_2":      None,
        "hidden_ability": None,
        "hp":             0,
        "atk":            0,
        "def":            0,
        "spa":            0,
        "spd":            0,
        "spe":            0,
        "point_value":    point_value,
    }


def get_learnable_slugs(api_data: dict) -> tuple[set[str], bool]:
    """Return (move_slugs, used_base_form_fallback).

    Mega evolutions and other alternate forms often have an empty moves list in
    PokeAPI — in that case, fall back to the base species' default form learnset.
    """
    raw_moves = api_data.get("moves", [])
    used_fallback = False
    if not raw_moves:
        species_name = api_data.get("species", {}).get("name")
        if species_name:
            base_data = fetch_pokemon(species_name)
            if base_data:
                raw_moves = base_data.get("moves", [])
                used_fallback = True
    return {m["move"]["name"] for m in raw_moves}, used_fallback


# ---------------------------------------------------------------------------
# File parsers
# ---------------------------------------------------------------------------

def parse_tiering_file(path: Path) -> list[tuple[str, int]]:
    entries: list[tuple[str, int]] = []
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            print(f"  [WARN] Line {line_no}: unexpected format — {raw!r}")
            continue
        name, pts = parts[0].strip(), parts[1].strip()
        try:
            entries.append((name, int(pts)))
        except ValueError:
            print(f"  [WARN] Line {line_no}: non-integer points '{pts}' — skipping")
    return entries


def parse_moves_file(path: Path) -> list[tuple[str, str]]:
    """Returns list of (display_name, slug) for each line in important-moves.txt."""
    results: list[tuple[str, str]] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        name = raw.strip()
        if name:
            results.append((name, move_name_to_slug(name)))
    return results


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def upsert_batched(
    supabase: "Client", table: str, rows: list[dict], on_conflict: str
) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        supabase.table(table).upsert(rows[i : i + BATCH_SIZE], on_conflict=on_conflict).execute()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        sys.exit(
            "Missing environment variables.\n"
            "Set SUPABASE_URL and SUPABASE_SERVICE_KEY, "
            "or create a .env / .env.local in the project root."
        )

    supabase: Client = create_client(supabase_url, supabase_key)

    for f in (TIERING_FILE, MOVES_FILE):
        if not f.exists():
            sys.exit(f"File not found: {f}")

    # ------------------------------------------------------------------
    # 1. Parse source files
    # ------------------------------------------------------------------
    entries     = parse_tiering_file(TIERING_FILE)
    move_pairs  = parse_moves_file(MOVES_FILE)          # [(display_name, slug), ...]
    move_slugs  = {slug for _, slug in move_pairs}      # set for fast lookup

    print(f"Loaded {len(entries)} Pokemon from {TIERING_FILE.name}")
    print(f"Loaded {len(move_pairs)} important moves from {MOVES_FILE.name}\n")

    # ------------------------------------------------------------------
    # 2. Fetch each Pokemon from PokeAPI
    # ------------------------------------------------------------------
    pokemon_rows:     list[dict]         = []
    placeholder_names: list[str]         = []
    # pokemon_slug → set of important move slugs it can learn
    learnable_map:    dict[str, set[str]] = {}

    for display_name, point_value in entries:
        slug    = name_to_slug(display_name)
        api_data = fetch_pokemon(slug)

        if api_data is not None:
            row = build_pokemon_row_from_api(api_data, display_name, point_value)
            learnable, used_fallback = get_learnable_slugs(api_data)
            learnable &= move_slugs
            learnable_map[slug] = learnable
            label = "FALLBACK    " if used_fallback else "OK          "
            print(f"  {label}{display_name}" + (" (moves from base form)" if used_fallback else ""))
        else:
            print(f"  PLACEHOLDER {display_name}  (not in PokeAPI — stats need manual entry)")
            row = build_placeholder_row(display_name, point_value)
            placeholder_names.append(display_name)
            # No learnset data available for custom forms

        pokemon_rows.append(row)

    # ------------------------------------------------------------------
    # 3. Upsert pokemon
    # ------------------------------------------------------------------
    print(f"\nUpserting {len(pokemon_rows)} Pokemon...")
    upsert_batched(supabase, "pokemon", pokemon_rows, on_conflict="slug")
    print("Done.")

    # ------------------------------------------------------------------
    # 4. Upsert important_moves (from the curated txt file)
    # ------------------------------------------------------------------
    move_rows = [{"name": name, "slug": slug} for name, slug in move_pairs]
    print(f"\nUpserting {len(move_rows)} important moves...")
    upsert_batched(supabase, "important_moves", move_rows, on_conflict="slug")
    print("Done.")

    # ------------------------------------------------------------------
    # 5. Build pokemon_moves junction
    #    Link each Pokemon to the important moves it can learn.
    # ------------------------------------------------------------------
    print("\nFetching inserted IDs from DB...")
    db_pokemon = supabase.table("pokemon").select("id, slug").execute().data
    db_moves   = supabase.table("important_moves").select("id, slug").execute().data

    pokemon_id_map: dict[str, int] = {p["slug"]: p["id"] for p in db_pokemon}
    move_id_map:    dict[str, int] = {m["slug"]: m["id"] for m in db_moves}

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

    print(f"Upserting {len(junction_rows)} pokemon↔move links...")
    upsert_batched(supabase, "pokemon_moves", junction_rows, on_conflict="pokemon_id,move_id")
    print("Done.\n")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    real_count   = len(pokemon_rows) - len(placeholder_names)
    print("=" * 55)
    print(f"Pokemon from PokeAPI        : {real_count}")
    print(f"Pokemon↔move links          : {len(junction_rows)}")
    print(f"Important moves seeded      : {len(move_rows)}")

    if placeholder_names:
        print(f"\nPlaceholders needing manual stat entry ({len(placeholder_names)}):")
        for name in placeholder_names:
            print(f"  - {name}")
        print("\nEdit these rows in the Supabase dashboard:")
        print("  Table Editor → pokemon → filter slug → update stats/types/abilities")

    print("=" * 55)


if __name__ == "__main__":
    main()
