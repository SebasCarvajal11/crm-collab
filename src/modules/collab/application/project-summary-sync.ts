type ProjectSummaryRepo = {
  syncProjectStatusAndProgress: (projectId: string) => Promise<void>;
};

/**
 * Recalcula el resumen sin hidratar todas las tareas en el proceso. La
 * agregación vive en PostgreSQL para que el coste sea constante en memoria,
 * incluso en proyectos con tableros grandes.
 */
export const syncProjectSummary = (repo: ProjectSummaryRepo, projectId: string) =>
  repo.syncProjectStatusAndProgress(projectId);
