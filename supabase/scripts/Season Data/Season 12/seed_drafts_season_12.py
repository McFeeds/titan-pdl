#!/usr/bin/env python3
"""
Seed Season 12 draft / roster data into Supabase.

Reads:  supabase/scripts/Season Data/Season 12/raw_drafts  (tab-separated)
        Columns: team_name <TAB> pokemon_name
        Blank pokemon_name rows are skipped.

Inserts into:
  rosters (pokemon_id, conference_id, season_id, team_id)

Pokemon names are normalised to slugs (lowercase, spaces→hyphens, dots removed)
and matched against pokemon.slug.  Any name that cannot be resolved is
collected and printed at the end so you can fix them manually.

Requirements:
  pip install -r supabase/scripts/requirements.txt

Environment variables (or .env.local in the project root):
  NEXT_PUBLIC_SUPABASE_URL  — project URL
  SUPABASE_SERVICE_KEY      — service-role key (bypasses RLS)
"""

import os
import sys
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parents[4] / ".env.local")
    load_dotenv(Path(__file__).parents[4] / ".env")
except ImportError:
    pass

SUPABASE_URL = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("ERROR: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY")

BASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

DRAFT_PATH  = Path(__file__).parent / "raw_drafts"
SEASON_NAME = "Season 12: Reg MA+"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get(path: str, params: dict | None = None) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=BASE_HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def upsert(path: str, payload: dict, on_conflict: str) -> None:
    headers = {
        **BASE_HEADERS,
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=headers,
        params={"on_conflict": on_conflict},
        json=payload,
    )
    r.raise_for_status()


def to_slug(name: str) -> str:
    """Convert a pokemon name as it appears in the draft file to a DB slug."""
    return (
        name.lower()
            .strip()
            .replace(" ", "-")
            .replace(".", "")
            .replace("'", "")
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # ---- season ----
    seasons = get("seasons", {"name": f"eq.{SEASON_NAME}", "select": "id,name"})
    if not seasons:
        sys.exit(f"ERROR: season '{SEASON_NAME}' not found — run seed_season_12.py first")
    season_id = seasons[0]["id"]
    print(f"Season: '{SEASON_NAME}' (id={season_id})")

    # ---- build lookup maps ----
    # pokemon slug → id
    pokemon_rows = get("pokemon", {"select": "id,slug"})
    pokemon_map: dict[str, int] = {p["slug"]: p["id"] for p in pokemon_rows}
    print(f"Loaded {len(pokemon_map)} pokemon")

    # team name (lowercased+stripped) → id
    team_rows = get("teams", {"select": "id,team_name"})
    team_map: dict[str, int] = {t["team_name"].lower().strip(): t["id"] for t in team_rows}
    print(f"Loaded {len(team_map)} teams")

    # team_id → conference_id for this season
    ts_rows = get("team_seasons", {
        "season_id": f"eq.{season_id}",
        "select": "team_id,conference_id",
    })
    conf_for_team: dict[int, int] = {ts["team_id"]: ts["conference_id"] for ts in ts_rows}
    print(f"Loaded {len(conf_for_team)} team_season placements\n")

    # ---- read draft file ----
    with open(DRAFT_PATH, encoding="utf-8") as f:
        lines = f.readlines()

    inserted = 0
    skipped_blank = 0
    errors: list[str] = []

    for lineno, line in enumerate(lines, start=1):
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 2:
            skipped_blank += 1
            continue

        raw_team    = parts[0].strip()
        raw_pokemon = parts[1].strip()

        if not raw_pokemon:
            skipped_blank += 1
            continue

        # resolve team
        team_id = team_map.get(raw_team.lower())
        if team_id is None:
            msg = f"line {lineno}: team not found — '{raw_team}'"
            errors.append(msg)
            continue

        # resolve conference
        conference_id = conf_for_team.get(team_id)
        if conference_id is None:
            msg = f"line {lineno}: no team_season for team '{raw_team}' in this season"
            errors.append(msg)
            continue

        # resolve pokemon by slug
        slug = to_slug(raw_pokemon)
        pokemon_id = pokemon_map.get(slug)
        if pokemon_id is None:
            msg = f"line {lineno}: pokemon not found — '{raw_pokemon}' (slug tried: '{slug}')"
            errors.append(msg)
            continue

        # insert roster entry
        upsert("rosters", {
            "pokemon_id":    pokemon_id,
            "conference_id": conference_id,
            "season_id":     season_id,
            "team_id":       team_id,
        }, on_conflict="pokemon_id,conference_id,season_id")

        print(f"  {raw_team}  ←  {raw_pokemon}")
        inserted += 1

    # ---- summary ----
    print(f"\n{'='*60}")
    print(f"Inserted/upserted : {inserted}")
    print(f"Blank rows skipped: {skipped_blank}")
    if errors:
        print(f"Errors ({len(errors)}):")
        for e in errors:
            print(f"  {e}")
    else:
        print("No errors.")


if __name__ == "__main__":
    main()
