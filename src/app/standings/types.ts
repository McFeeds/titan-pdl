export interface TeamStanding {
  id: number;
  team_name: string;
  logo_url: string | null;
  coaches: string[];
  wins: number;
  losses: number;
  // Total individual games won minus lost across the season (not the same
  // as match-level W/L — e.g. winning singles 1-0 and losing doubles 1-2 is
  // a 1-1 match record but a 0 game differential).
  plusMinus: number;
}

export interface GroupStandings {
  id: number;
  name: string;
  teams: TeamStanding[];
}

export interface ConferenceStandings {
  id: number;
  name: string;
  groups: GroupStandings[];
}
