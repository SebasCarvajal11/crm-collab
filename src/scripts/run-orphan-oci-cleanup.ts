import { runOrphanOciCleanup } from "../jobs/run-orphan-oci-cleanup";

const result = await runOrphanOciCleanup();
console.log("Limpieza OCI huérfanos:", result);
