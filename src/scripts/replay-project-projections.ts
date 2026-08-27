import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { db, pool } from "../db/connection";
import { projects } from "../db/schema";
import { createCollabOutboxRepository } from "../modules/collab/events/collab-outbox.repository";
import { COLLAB_EVENT_CONTRACT_VERSION } from "@sebascarvajal11/cima-contracts/collab-project-events";

const execute = process.argv.includes("--execute");
const includeArchived = process.argv.includes("--include-archived");

async function main(): Promise<void> {
  const rows = await db
    .select()
    .from(projects)
    .where(includeArchived ? undefined : eq(projects.isArchived, false))
    .orderBy(asc(projects.id));

  if (!execute) {
    console.info(JSON.stringify({
      mode: "dry-run",
      projects: rows.length,
      includeArchived,
      instruction: "Ejecute con --execute para publicar las instantáneas en el outbox.",
    }));
    return;
  }

  const correlationId = uuidv7();
  await db.transaction(async (tx) => {
    const outbox = createCollabOutboxRepository(tx);
    for (const project of rows) {
      await outbox.createCollabOutboxEvent("project.updated", project.id, {
        id: uuidv7(),
        version: 1,
        contractVersion: COLLAB_EVENT_CONTRACT_VERSION,
        type: "project.updated",
        projectId: project.id,
        actorSub: project.adminResponsibleSub,
        timestamp: new Date().toISOString(),
        correlationId,
        data: {
          projectId: project.id,
          projectName: project.name,
          projectType: project.type,
          clientName: project.clientName,
          clientSub: project.clientSub ?? undefined,
          adminResponsibleSub: project.adminResponsibleSub,
          status: project.status,
          description: project.description,
          progressPercent: project.progressPercent,
          isArchived: project.isArchived,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
        },
      });
    }
  });

  console.info(JSON.stringify({
    mode: "executed",
    projects: rows.length,
    includeArchived,
    correlationId,
  }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
