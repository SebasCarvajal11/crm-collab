import "dotenv/config";
import { anonymizeUserPII } from "../shared/identity-snapshot-store";

async function main() {
  const userSub = process.argv[2];
  if (!userSub) {
    console.error("Uso: pnpm tsx src/scripts/pii-clean.ts <userSub>");
    process.exit(1);
  }

  try {
    await anonymizeUserPII(userSub);
    console.log(`[pii-clean] Informacion PII para el usuario ${userSub} anonimizada correctamente en crm-collab.`);
    process.exit(0);
  } catch (err) {
    console.error("[pii-clean] Error al anonimizar PII:", err);
    process.exit(1);
  }
}

main();
