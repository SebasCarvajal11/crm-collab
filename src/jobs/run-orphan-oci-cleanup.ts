import { createCollabRepository } from "../modules/collab/collab.repository";
import { ociStorage } from "../shared/storage/oci-storage";
import { env } from "../config/env";

const OCI_PROJECTS_PREFIX = "projects/";

export async function runOrphanOciCleanup() {
  const repo = createCollabRepository();
  const registered = new Set(await repo.listAllProjectFileStoragePaths());
  const objects = await ociStorage.listObjects(OCI_PROJECTS_PREFIX);
  const graceMs = env.OCI_ORPHAN_GRACE_MS;
  const now = Date.now();

  let deleted = 0;
  for (const obj of objects) {
    if (registered.has(obj.key)) continue;
    const ageMs = obj.lastModified ? now - obj.lastModified.getTime() : graceMs + 1;
    if (ageMs < graceMs) continue;
    await ociStorage.deleteObject(obj.key);
    deleted++;
  }

  if (deleted > 0) {
    console.log(`[orphan-oci-cleanup] eliminados ${deleted} objeto(s) huérfano(s) en OCI`);
  }
  return { scanned: objects.length, deleted };
}
