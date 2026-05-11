import { projectsRepository } from "./repository/projects.repository";
import { auditRepository } from "./repository/audit.repository";

export const collabRepository = {
  ...projectsRepository,
  ...auditRepository,
};

export type CollabRepository = typeof collabRepository;
