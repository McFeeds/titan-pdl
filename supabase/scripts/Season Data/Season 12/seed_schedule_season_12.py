#!/usr/bin/env python3
"""
Seed Season 12 match schedule into Supabase.

Reads:  supabase/scripts/Season Data/Season 12/raw_schedule.txt

The file is tab-delimited. Each row covers one match slot across 4 groups:
  col 0 : week_number
  col 1,2: Red   home, away  (col 3 = winner, ignored)
  col 4,5: Blue  home, away  (col 6 = winner, ignored)
  col 7,8: Gold  home, away  (col 9 = winner, ignored)
  col 10,11: Silver home, away  (col 12 = winner, ignored)

Upserts into:
  - matches  (unique key: season_id + week_number + home_team_id + away_team_id)

Requirements:
  pip install -r supabase/scripts/requirements.txt

Environment variables (or a .env.local in the project root):
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

SCHEDULE_PATH = Path(__file__).parent / "raw_schedule.txt"
SEASON_NAME = "Season 12: Reg MA+"

# Column index of each group's home team; away is offset+1, winner is offset+2 (skipped)
GROUP_COL_OFFSETS = [1, 4, 7, 10]


def get(path: str, params: dict | None = None) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=BASE_HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def upsert(path: str, payload: dict, on_conflict: str) -> dict:
    headers = {
        **BASE_HEADERS,
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=headers,
        params={"on_conflict": on_conflict},
        json=payload,
    )
    r.raise_for_status()
    result = r.json()
    return result[0] if isinstance(result, list) else result


def main() -> None:
    # ---- season ----
    seasons = get("seasons", {"name": f"eq.{SEASON_NAME}", "select": "id,name"})
    if not seasons:
        sys.exit(f"ERROR: season '{SEASON_NAME}' not found — run seed_season_12.py first")
    season_id = seasons[0]["id"]
    print(f"Found season '{SEASON_NAME}' (id={season_id})")

    # ---- team name → id lookup ----
    teams = get("teams", {"select": "id,team_name"})
    team_map: dict[str, int] = {t["team_name"].strip(): t["id"] for t in teams}
    print(f"Loaded {len(team_map)} teams\n")

    # ---- parse schedule ----
    with open(SCHEDULE_PATH, encoding="utf-8") as f:
        lines = f.readlines()

    # Skip the group-header row (line 0)
    data_lines = lines[1:]

    inserted = 0
    skipped = 0
    errors: list[str] = []

    for line in data_lines:
        cols = [c.strip() for c in line.rstrip("\n").split("\t")]

        if not cols or not cols[0]:
            continue

        try:
            week = int(cols[0])
        except ValueError:
            continue

        for offset in GROUP_COL_OFFSETS:
            home_name = cols[offset] if offset < len(cols) else ""
            away_name = cols[offset + 1] if offset + 1 < len(cols) else ""

            if not home_name or not away_name:
                skipped += 1
                continue

            home_id = team_map.get(home_name)
            away_id = team_map.get(away_name)

            if home_id is None:
                msg = f"Week {week}: unknown home team '{home_name}'"
                print(f"  ERROR — {msg}")
                errors.append(msg)
                continue
            if away_id is None:
                msg = f"Week {week}: unknown away team '{away_name}'"
                print(f"  ERROR — {msg}")
                errors.append(msg)
                continue

            upsert("matches", {
                "season_id":    season_id,
                "week_number":  week,
                "home_team_id": home_id,
                "away_team_id": away_id,
            }, on_conflict="season_id,week_number,home_team_id,away_team_id")

            print(f"  Week {week}: {home_name}  vs  {away_name}")
            inserted += 1

    print(f"\nDone. {inserted} match(es) upserted, {skipped} empty slot(s) skipped.")
    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors:
            print(f"  {e}")


if __name__ == "__main__":
    main()
