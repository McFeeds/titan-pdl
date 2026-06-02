import TeamForm from "../TeamForm";
import { createTeam } from "../actions";

export default async function NewTeamPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Add Team</h1>
      <TeamForm action={createTeam} />
    </div>
  );
}
