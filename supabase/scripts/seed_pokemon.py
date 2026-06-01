#!/usr/bin/env python3
"""
Seed the Supabase pokemon, important_moves, and pokemon_moves tables.

Data sources:
  - Point values        : pokemon-tiering.txt   (tab-separated: name<TAB>points)
  - Curated move list   : important-moves.txt   (one move name per line)
  - Stats/types/abilities : PokeAPI (https://pokeapi.co)
  - Learnsets           : Pokemon Showdown (more complete than PokeAPI)

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

import json
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

TIERING_FILE             = Path(__file__).parent / "pokemon-tiering.txt"
MOVES_FILE               = Path(__file__).parent / "important-moves.txt"
POKEAPI_BASE             = "https://pokeapi.co/api/v2"
SHOWDOWN_BASE_URL        = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master"
SHOWDOWN_LEARNSETS_URL   = f"{SHOWDOWN_BASE_URL}/data/learnsets.ts"
SHOWDOWN_CHAMPIONS_URL   = f"{SHOWDOWN_BASE_URL}/data/mods/champions/learnsets.ts"
REQUEST_DELAY            = 0.25   # seconds between PokeAPI requests
BATCH_SIZE               = 50     # rows per Supabase upsert

# Generation priority: newest first. Each inner list is a group of generation
# prefixes treated as equivalent (e.g. SwSh / PLA / BDSP all count as "Gen 8").
# The first group where the Pokemon has at least one move wins; its full set of
# moves from that generation group is used.  Older generations are only
# consulted if the Pokemon has no moves at all in newer ones.
GENERATION_PRIORITY: list[list[str]] = [
    ["9"],            # Gen 9  – Scarlet / Violet
    ["8", "8a", "8b"],# Gen 8  – Sword/Shield, Legends: Arceus, BDSP
    ["7"],            # Gen 7  – Sun/Moon, USUM
    ["6"],            # Gen 6  – X/Y, ORAS
    ["5"],            # Gen 5  – Black/White, B2W2
    ["4"],            # Gen 4  – Diamond/Pearl, Platinum, HGSS
    ["3"],            # Gen 3  – RSE, FRLG
    ["2"],            # Gen 2  – Gold/Silver, Crystal
    ["1"],            # Gen 1  – Red/Blue, Yellow
]


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


def _get_with_retry(url: str, retries: int = 3, timeout: int = 30) -> requests.Response:
    """GET a URL with exponential-backoff retry on timeout or 5xx errors."""
    delay = 2.0
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=timeout)
            if resp.status_code < 500:
                return resp
        except requests.exceptions.ReadTimeout:
            pass
        if attempt < retries - 1:
            print(f"    [retry {attempt + 1}/{retries - 1}] {url}")
            time.sleep(delay)
            delay *= 2
    # Final attempt — let exceptions propagate
    return requests.get(url, timeout=timeout)


def fetch_pokemon(slug: str) -> dict | None:
    """Fetch /pokemon/{slug}; on 404 falls back to /pokemon-species/{slug} and
    fetches the default variety (handles multi-form Pokemon like Aegislash)."""
    if slug in _api_cache:
        return _api_cache[slug]

    resp = _get_with_retry(f"{POKEAPI_BASE}/pokemon/{slug}")

    if resp.status_code == 404:
        species_resp = _get_with_retry(f"{POKEAPI_BASE}/pokemon-species/{slug}")
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

        resp = _get_with_retry(default_variety["pokemon"]["url"])

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


def _parse_showdown_learnset_file(url: str) -> dict:
    """Fetch and parse any Showdown learnset TypeScript/JS file.

    Locates the top-level object by brace-matching so it's robust to CommonJS,
    ESM, or TypeScript wrapper syntax changes.
    """
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    text = resp.text

    start = text.find("{")
    if start == -1:
        raise ValueError(f"No '{{' found in response from {url} (first 200 chars): {text[:200]!r}")

    depth = 0
    end = start
    in_string = False
    escape_next = False
    for i, ch in enumerate(text[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break

    obj_text = text[start : end + 1]

    # Strip TypeScript/JS comments before any other processing.
    # Block comments first so their content doesn't confuse the line-comment strip.
    obj_text = re.sub(r'/\*.*?\*/', '', obj_text, flags=re.DOTALL)
    obj_text = re.sub(r'//[^\n]*', '', obj_text)

    # Replace JS-only literals that are not valid JSON
    obj_text = re.sub(r'\bundefined\b', 'null', obj_text)

    # Convert single-quoted strings to double-quoted (JS allows both, JSON requires double).
    # Handles escaped characters inside the string (e.g. \') before replacing.
    obj_text = re.sub(r"'((?:[^'\\]|\\.)*)'", r'"\1"', obj_text)

    obj_text = re.sub(r'([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)', r'\1"\2"\3', obj_text)
    obj_text = re.sub(r',(\s*[}\]])', r'\1', obj_text)

    try:
        return json.loads(obj_text)
    except json.JSONDecodeError as e:
        ctx_start = max(0, e.pos - 120)
        ctx_end = min(len(obj_text), e.pos + 120)
        raise ValueError(
            f"Failed to parse learnsets JSON from {url}: {e}\n"
            f"Context around char {e.pos}:\n{obj_text[ctx_start:ctx_end]!r}"
        ) from e


def fetch_showdown_learnsets() -> tuple[dict, dict]:
    """Return (base_learnsets, champions_learnsets) from the Showdown GitHub repo."""
    print("Fetching base learnsets from Pokemon Showdown...")
    base = _parse_showdown_learnset_file(SHOWDOWN_LEARNSETS_URL)
    print(f"  Loaded {len(base)} base learnset entries")

    print("Fetching Champions mod learnsets from Pokemon Showdown...")
    champions = _parse_showdown_learnset_file(SHOWDOWN_CHAMPIONS_URL)
    print(f"  Loaded {len(champions)} Champions learnset entries\n")

    return base, champions


def _showdown_id(slug: str) -> str:
    """PokeAPI slug → Showdown ID: 'gengar-mega' → 'gengarmega'."""
    return slug.replace("-", "")


def _extract_learnset(entry: dict) -> dict:
    """Return the flat move→methods dict from a Showdown learnset entry."""
    if "learnset" in entry:
        return entry["learnset"]
    return {k: v for k, v in entry.items() if isinstance(v, list)}


def _moves_for_gen_group(learnset: dict, prefixes: list[str]) -> set[str]:
    """Return all move IDs the Pokemon can learn in a generation group."""
    return {
        move for move, methods in learnset.items()
        if any(
            any(method.startswith(p) for p in prefixes)
            for method in methods
        )
    }


def _moves_by_priority(learnset: dict) -> set[str]:
    """Return moves for the highest generation this Pokemon appears in.

    Walks GENERATION_PRIORITY from newest to oldest and returns the full
    move set for the first generation group where the Pokemon has any moves.
    """
    for gen_prefixes in GENERATION_PRIORITY:
        moves = _moves_for_gen_group(learnset, gen_prefixes)
        if moves:
            return moves
    return set()


def _resolve_learnset(poke_id: str, api_data: dict, learnset_source: dict) -> tuple[dict, bool]:
    """Look up a Pokemon's learnset in a given source, falling back to base species for forms."""
    entry = learnset_source.get(poke_id)
    if entry:
        return _extract_learnset(entry), False

    species_name = api_data.get("species", {}).get("name", "")
    base_id = _showdown_id(species_name)
    if base_id and base_id != poke_id:
        base_entry = learnset_source.get(base_id)
        if base_entry:
            return _extract_learnset(base_entry), True

    return {}, False


def get_learnable_slugs(
    api_data: dict,
    base_learnsets: dict,
    champions_learnsets: dict,
    move_slugs: set[str],
) -> tuple[set[str], bool]:
    """Return (learnable_important_move_slugs, used_base_form_fallback).

    Priority:
      1. Champions mod learnset — if the Pokemon has an entry, use it.
      2. Base learnsets with generation priority (Gen 9 → Gen 8 → … → Gen 1).
    Megas and other forms with no direct entry fall back to the base species
    in whichever source is being consulted.
    """
    showdown_to_slug = {slug.replace("-", ""): slug for slug in move_slugs}
    poke_id = _showdown_id(api_data["name"])

    # 1. Champions mod
    learnset, used_fallback = _resolve_learnset(poke_id, api_data, champions_learnsets)
    if learnset:
        available = set(learnset.keys())
        return {showdown_to_slug[sid] for sid in showdown_to_slug if sid in available}, used_fallback

    # 2. Base learnsets with generation-priority filtering
    learnset, used_fallback = _resolve_learnset(poke_id, api_data, base_learnsets)
    if not learnset:
        print(f"  [WARN] No Showdown learnset for '{api_data['name']}' (id: {poke_id})")
        return set(), False

    available = _moves_by_priority(learnset)
    return {showdown_to_slug[sid] for sid in showdown_to_slug if sid in available}, used_fallback


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

def clear_tables(supabase: "Client") -> None:
    """Delete all rows from the three tables in FK-safe order."""
    supabase.table("pokemon_moves").delete().gte("pokemon_id", 0).execute()
    supabase.table("pokemon").delete().gte("id", 0).execute()
    supabase.table("important_moves").delete().gte("id", 0).execute()


def insert_batched(supabase: "Client", table: str, rows: list[dict]) -> None:
    for i in range(0, len(rows), BATCH_SIZE):
        supabase.table(table).insert(rows[i : i + BATCH_SIZE]).execute()


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
    # 2. Fetch Pokemon Showdown learnset data (single request, used for all Pokemon)
    # ------------------------------------------------------------------
    base_learnsets, champions_learnsets = fetch_showdown_learnsets()

    # ------------------------------------------------------------------
    # 3. Fetch each Pokemon from PokeAPI
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
            learnable, used_fallback = get_learnable_slugs(api_data, base_learnsets, champions_learnsets, move_slugs)
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
    # 4. Clear existing data and insert fresh rows
    # ------------------------------------------------------------------
    print("\nClearing existing table data...")
    clear_tables(supabase)
    print("Done.")

    # Deduplicate by slug — keep last occurrence to match prior upsert behaviour.
    # Duplicates in the tiering file are warned about during the fetch loop above.
    seen_slugs: dict[str, int] = {}
    for i, row in enumerate(pokemon_rows):
        if row["slug"] in seen_slugs:
            print(f"  [WARN] Duplicate slug '{row['slug']}' in tiering file — keeping last entry")
        seen_slugs[row["slug"]] = i
    pokemon_rows = [pokemon_rows[i] for i in seen_slugs.values()]

    print(f"\nInserting {len(pokemon_rows)} Pokemon...")
    insert_batched(supabase, "pokemon", pokemon_rows)
    print("Done.")

    move_rows = [{"name": name, "slug": slug} for name, slug in move_pairs]
    print(f"\nInserting {len(move_rows)} important moves...")
    insert_batched(supabase, "important_moves", move_rows)
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

    print(f"Inserting {len(junction_rows)} pokemon↔move links...")
    insert_batched(supabase, "pokemon_moves", junction_rows)
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
