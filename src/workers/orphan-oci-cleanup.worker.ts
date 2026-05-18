/**
 * Elimina objetos en OCI bajo `projects/` sin registro en project_files (upload a medias).
 * Ejecutar: pnpm worker:orphan-oci
 */
import { env } from "../config/env";
import { runOrphanOciCleanup } from "../jobs/run-orphan-oci-cleanup";

console.log(
  `[worker:orphan-oci] intervalo ${env.OCI_ORPHAN_CLEANUP_INTERVAL_MS}ms, gracia ${env.OCI_ORPHAN_GRACE_MS}ms`,
);

const tick = async () => {
  try {
    await runOrphanOciCleanup();
  } catch (err) {
    console.error("[worker:orphan-oci] error:", err);
  }
};

await tick();
const timer = setInterval(tick, env.OCI_ORPHAN_CLEANUP_INTERVAL_MS);
if (typeof timer.unref === "function") timer.unref();

const shutdown = () => {
  clearInterval(timer);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
