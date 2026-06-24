#!/usr/bin/env python3
"""
Seed Season 12 team data into Supabase.

Reads:  supabase/scripts/Season Data/Season 12/Team Info  (headerless CSV)

Inserts / upserts:
  - seasons       (creates "Season 12" if it does not exist)
  - teams         (inserts once; skips if team_name already present)
  - team_seasons  (upserts: team_id + season_id PK)
  - team_members  (upserts: team_id + season_id + discord_id unique key)

Division → conference mapping assumed:
  Ruby, Sapphire  →  Hoenn
  Diamond, Pearl  →  Sinnoh

Requirements (same as other scripts):
  pip install -r supabase/scripts/requirements.txt

Environment variables (or a .env.local in the project root):
  NEXT_PUBLIC_SUPABASE_URL  — project URL
  SUPABASE_SERVICE_KEY      — service-role key (bypasses RLS)
"""

import csv
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

CSV_PATH = Path(__file__).parent / "team_info.csv"
SEASON_NAME = "Season 12: Reg MA+"

# Which Supabase conference name each division belongs to (case-insensitive key)
DIVISION_TO_CONFERENCE = {
    "ruby":     "hoenn",
    "sapphire": "hoenn",
    "diamond":  "sinnoh",
    "pearl":    "sinnoh",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get(path: str, params: dict | None = None) -> list:
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=BASE_HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def post(path: str, payload: dict, prefer: str = "return=representation") -> dict:
    headers = {**BASE_HEADERS, "Prefer": prefer}
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, json=payload)
    r.raise_for_status()
    result = r.json()
    return result[0] if isinstance(result, list) else result


def upsert(path: str, payload: dict, on_conflict: str) -> dict:
    headers = {
        **BASE_HEADERS,
        "Prefer": f"resolution=merge-duplicates,return=representation",
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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # ---- season ----
    seasons = get("seasons", {"name": f"eq.{SEASON_NAME}", "select": "id,name"})
    if seasons:
        season_id = seasons[0]["id"]
        print(f"Found season '{SEASON_NAME}' (id={season_id})")
    else:
        season = post("seasons", {"name": SEASON_NAME, "is_active": False})
        season_id = season["id"]
        print(f"Created season '{SEASON_NAME}' (id={season_id})")

    # ---- conferences ----
    conferences = get("conferences", {"select": "id,name"})
    conf_map: dict[str, int] = {c["name"].lower(): c["id"] for c in conferences}
    if not conf_map:
        sys.exit("ERROR: no conferences found — add Hoenn / Sinnoh via the admin panel first")
    print(f"Conferences: {conf_map}")

    # ---- groups ----
    groups = get("groups", {"select": "id,name,conference_id"})
    group_map: dict[str, dict] = {g["name"].lower(): g for g in groups}
    if not group_map:
        sys.exit("ERROR: no groups found — add Ruby / Sapphire / Diamond / Pearl via the admin panel first")
    print(f"Groups: {list(group_map.keys())}\n")

    # ---- read CSV ----
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"Processing {len(rows)} teams...\n")
    errors: list[str] = []

    for row in rows:
        draft_position = int(row["Draft Order"].strip())
        team_name      = row["Team"].strip()
        sd_name_raw    = row["SD Name"].strip()
        logo_url       = row["Logo Link"].strip() or None
        division       = row["Division"].strip().lower()
        discord_raw    = row["Discord"].strip()

        print(f"[{division.upper()}] {team_name} (pick {draft_position})")

        # resolve conference + group
        conf_key = DIVISION_TO_CONFERENCE.get(division)
        if not conf_key:
            msg = f"  SKIP — unknown division '{division}'"
            print(msg); errors.append(msg); continue

        conference_id = conf_map.get(conf_key)
        if conference_id is None:
            msg = f"  SKIP — conference '{conf_key}' not found in DB"
            print(msg); errors.append(msg); continue

        group = group_map.get(division)
        if group is None:
            msg = f"  SKIP — group '{division}' not found in DB"
            print(msg); errors.append(msg); continue
        group_id = group["id"]

        # ---- team ----
        existing = get("teams", {"team_name": f"eq.{team_name}", "select": "id"})
        if existing:
            team_id = existing[0]["id"]
            print(f"  team already exists (id={team_id})")
        else:
            team = post("teams", {"team_name": team_name, "logo_url": logo_url})
            team_id = team["id"]
            print(f"  created team (id={team_id})")

        # ---- team_season ----
        upsert("team_seasons", {
            "team_id":        team_id,
            "season_id":      season_id,
            "conference_id":  conference_id,
            "group_id":       group_id,
            "draft_position": draft_position,
        }, on_conflict="team_id,season_id")
        print(f"  upserted team_season")

        # ---- team_members ----
        # Some rows list multiple coaches separated by " / " — insert each separately.
        discord_ids   = [d.strip() for d in discord_raw.split("/") if d.strip()]
        showdown_names = [s.strip() for s in sd_name_raw.split("/") if s.strip()]

        for i, discord_id in enumerate(discord_ids):
            sd = showdown_names[i] if i < len(showdown_names) else None
            role = "owner" if i == 0 else "co_owner"
            upsert("team_members", {
                "team_id":       team_id,
                "season_id":     season_id,
                "discord_id":    discord_id,
                "showdown_name": sd,
                "role":          role,
            }, on_conflict="team_id,season_id,discord_id")
            print(f"  member: discord={discord_id!r}  sd={sd!r}  role={role}")

        print()

    # ---- summary ----
    if errors:
        print(f"\n{'='*60}")
        print(f"Completed with {len(errors)} skipped row(s):")
        for e in errors:
            print(f"  {e}")
    else:
        print("All rows imported successfully.")


if __name__ == "__main__":
    main()
