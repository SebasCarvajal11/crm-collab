import "dotenv/config";
import pg from "pg";
import { readFileSync } from "fs";
import { join } from "path";

const { Client } = pg;

async function bootstrap() {
  const superuserUrl = process.env.DB_SUPERUSER_URL;
  const targetDbUrl = process.env.DATABASE_URL;
  const targetSchema = process.env.DB_SCHEMA;

  if (!targetDbUrl || !targetSchema) {
    console.error("Missing DATABASE_URL or DB_SCHEMA in environment");
    process.exit(1);
  }

  let url: URL;
  try {
    url = new URL(targetDbUrl);
  } catch (err) {
    console.error("Failed to parse DATABASE_URL as a URL:", err);
    process.exit(1);
  }

  const targetUser = url.username;
  const targetPassword = url.password;
  const targetDbName = url.pathname.substring(1);

  if (!targetUser || !targetPassword) {
    console.error("DATABASE_URL must contain a username and password");
    process.exit(1);
  }

  const serviceVersion = process.env.SERVICE_VERSION || (() => {
    try {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
      return pkg.version || "1.0.0";
    } catch {
      return "1.0.0";
    }
  })();

  const connectionString = superuserUrl || targetDbUrl;
  console.log(`Connecting to database...`);
  const client = new Client({ connectionString });

  try {
    await client.connect();

    console.log(`Setting up role and schema for: ${targetUser} -> ${targetSchema}`);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${targetUser}') THEN
          CREATE ROLE "${targetUser}" LOGIN PASSWORD '${targetPassword}';
        ELSE
          ALTER ROLE "${targetUser}" WITH PASSWORD '${targetPassword}';
        END IF;
      END
      $$;
    `);

    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;`);

    await client.query(`GRANT CONNECT ON DATABASE "${targetDbName}" TO "${targetUser}";`);

    await client.query(`CREATE SCHEMA IF NOT EXISTS "${targetSchema}" AUTHORIZATION "${targetUser}";`);
    await client.query(`ALTER SCHEMA "${targetSchema}" OWNER TO "${targetUser}";`);

    await client.query(`REVOKE ALL ON SCHEMA "${targetSchema}" FROM PUBLIC;`);

    await client.query(`GRANT USAGE, CREATE ON SCHEMA "${targetSchema}" TO "${targetUser}";`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${targetSchema}" TO "${targetUser}";`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "${targetSchema}" TO "${targetUser}";`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA "${targetSchema}" TO "${targetUser}";`);

    await client.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE "${targetUser}" IN SCHEMA "${targetSchema}"
        GRANT ALL PRIVILEGES ON TABLES TO "${targetUser}";
    `);
    await client.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE "${targetUser}" IN SCHEMA "${targetSchema}"
        GRANT ALL PRIVILEGES ON SEQUENCES TO "${targetUser}";
    `);
    await client.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE "${targetUser}" IN SCHEMA "${targetSchema}"
        GRANT ALL PRIVILEGES ON FUNCTIONS TO "${targetUser}";
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${targetSchema}"."schema_version" (
        "id" SERIAL PRIMARY KEY,
        "version" VARCHAR(50) NOT NULL,
        "applied_by" VARCHAR(100) NOT NULL,
        "applied_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        "source" VARCHAR(255) NOT NULL
      );
    `);

    await client.query(`GRANT ALL PRIVILEGES ON TABLE "${targetSchema}"."schema_version" TO "${targetUser}";`);

    const versionCheck = await client.query(
      `SELECT "version" FROM "${targetSchema}"."schema_version" ORDER BY "id" DESC LIMIT 1`
    );
    const latestVersion = versionCheck.rows[0]?.version;
    if (latestVersion !== serviceVersion) {
      await client.query(
        `INSERT INTO "${targetSchema}"."schema_version" ("version", "applied_by", "source") VALUES ($1, $2, $3)`,
        [serviceVersion, targetUser, "bootstrap"]
      );
      console.log(`✓ Recorded new schema version: ${serviceVersion}`);
    } else {
      console.log(`✓ Schema version ${serviceVersion} is already recorded as the latest.`);
    }

    console.log(`✓ Database bootstrap for ${targetSchema} completed successfully.`);
  } catch (err) {
    console.error("✗ Failed to bootstrap database:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

bootstrap();
