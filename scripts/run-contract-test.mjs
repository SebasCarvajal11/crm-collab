import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const collabContractFiles = readdirSync("tests")
  .filter((file) => file.endsWith(".hurl"))
  .sort((left, right) => left.localeCompare(right, "en"))
  .map((file) => `tests/${file}`);

if (!collabContractFiles.length) {
  throw new Error("No se encontraron pruebas de contrato de colaboración");
}

const failures = [];
const baseUrl = process.env.CONTRACT_BASE_URL ?? "http://localhost:28080";

for (const file of collabContractFiles) {
  const result = spawnSync("hurl", [
    "--test",
    "--variable", `base_url=${baseUrl}`,
    "--variable", "LOGIN_IP=127.0.0.1",
    "--variable", `TEST_SUFFIX=contract_${Date.now()}`,
    "--variable", "WORKER_EMAIL=ana.martinez@cima.dev",
    "--variable", "WORKER_PASSWORD=Demo123!",
    "--variable", "CLIENT_EMAIL=contacto@restauranteelbuensabor.com",
    "--variable", "CLIENT_PASSWORD=Demo123!",
    file,
  ], { stdio: "inherit", shell: process.platform === "win32" });

  if (result.status !== 0) {
    failures.push({ file, exitCode: result.status ?? 1 });
  }
}

if (failures.length) {
  console.error("\nSuites de colaboración fallidas:");
  for (const failure of failures) {
    console.error(`- ${failure.file} (código ${failure.exitCode})`);
  }
  process.exit(1);
}
