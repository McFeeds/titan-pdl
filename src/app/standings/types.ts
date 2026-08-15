export interface TeamStanding {
  id: number;
  team_name: string;
  logo_url: string | null;
  wins: number;
  losses: number;
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
