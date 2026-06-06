import "dotenv/config";
import { Client } from "pg";
import { z } from "zod";

const bootstrapEnvSchema = z.object({
  AUTH_SERVICE_URL: z
    .string()
    .url("AUTH_SERVICE_URL debe ser una URL valida")
    .default("http://localhost:3000"),
  GATEWAY_TRUST_SECRET: z.string().min(32, "GATEWAY_TRUST_SECRET es requerida"),
  DATABASE_URL: z.string().url("DATABASE_URL debe ser una URL PostgreSQL valida"),
  DB_SCHEMA: z.literal("schema_collab"),
});

const parsed = bootstrapEnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("[hydrate-identity] Variables de bootstrap invalidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

const targetClient = new Client({
  connectionString: env.DATABASE_URL,
  options: `-c search_path=${env.DB_SCHEMA}`,
});

async function hydrateIdentitySnapshots() {
  console.log(
    `[hydrate-identity] Bootstrap manual: leyendo usuarios desde REST API en ${env.AUTH_SERVICE_URL}/auth/bootstrap-identities`
  );

  await targetClient.connect();

  const response = await fetch(`${env.AUTH_SERVICE_URL}/auth/bootstrap-identities`, {
    headers: {
      "X-Gateway-Trust": env.GATEWAY_TRUST_SECRET,
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Error en peticion a auth service (HTTP ${response.status}): ${errText}`);
  }

  const { data: users } = (await response.json()) as {
    data: Array<{
      subject: string;
      email: string;
      role: string;
      first_name: string | null;
      last_name: string | null;
      client_kind: "natural" | "juridical" | null;
      company_name: string | null;
      profession: string | null;
    }>;
  };
  if (!users.length) {
    console.log("[hydrate-identity] No se encontraron usuarios activos. Nada que hidratar.");
    return;
  }

  console.log(
    `[hydrate-identity] ${users.length} usuarios encontrados. Aplicando upsert en snapshots locales...`,
  );

  await targetClient.query("BEGIN");
  try {
    for (const user of users) {
      await targetClient.query(
        `
          INSERT INTO schema_collab.user_identity_snapshots (
            user_sub,
            email,
            role,
            first_name,
            last_name,
            client_kind,
            company_name,
            profession,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (user_sub) DO UPDATE SET
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            client_kind = EXCLUDED.client_kind,
            company_name = EXCLUDED.company_name,
            profession = EXCLUDED.profession,
            updated_at = NOW()
        `,
        [
          user.subject,
          user.email,
          user.role,
          user.first_name,
          user.last_name,
          user.client_kind,
          user.company_name,
          user.profession,
        ],
      );
    }
    await targetClient.query("COMMIT");
  } catch (err) {
    await targetClient.query("ROLLBACK").catch(() => undefined);
    throw err;
  }

  console.log(`[hydrate-identity] ${users.length} snapshots insertados/actualizados correctamente.`);
}

hydrateIdentitySnapshots()
  .catch((err) => {
    console.error("[hydrate-identity] Error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await targetClient.end().catch(() => undefined);
  });
