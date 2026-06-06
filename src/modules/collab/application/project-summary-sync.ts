import type { ProjectType } from "../collab.types";
import { ProjectAggregate } from "../domain/project-aggregate";

type ProjectSummaryRepo = {
  listTaskStatusSnapshotsByProject: (projectId: string) => Promise<any[]>;
  updateProjectSummary: (projectId: string, summary: any) => Promise<any>;
};

export const syncProjectSummary = async (
  repo: ProjectSummaryRepo,
  projectId: string,
  projectType: ProjectType,
) => {
  const taskSnapshots = await repo.listTaskStatusSnapshotsByProject(projectId);
  const aggregate = ProjectAggregate.fromSnapshots(projectType, taskSnapshots);
  const summary = aggregate.createStatusSnapshot();

  await repo.updateProjectSummary(projectId, summary);

  return summary;
};
