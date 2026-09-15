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
const runId = Date.now();
const reportDirectory = process.env.HURL_REPORT_HTML;

for (const [index, file] of collabContractFiles.entries()) {
  const args = [
    "--test",
    ...(reportDirectory ? ["--report-html", reportDirectory] : []),
    "--variable", `base_url=${baseUrl}`,
    // Cada escenario autentica los tres roles; aislar su IP evita que una
    // política de rate limiting del gateway cree dependencia entre archivos.
    "--variable", `LOGIN_IP=198.51.100.${index + 10}`,
    // Un único identificador por ejecución conserva los escenarios aislados y
    // hace trazable cualquier recurso creado en la plataforma compartida.
    "--variable", `TEST_SUFFIX=contract_${runId}`,
    "--variable", `ADMIN_EMAIL=${process.env.ADMIN_EMAIL ?? "admin@cima.dev"}`,
    "--secret", `ADMIN_PASSWORD=${process.env.ADMIN_PASSWORD ?? "Admin123!"}`,
    "--variable", `WORKER_EMAIL=${process.env.WORKER_EMAIL ?? "ana.martinez@cima.dev"}`,
    "--secret", `WORKER_PASSWORD=${process.env.WORKER_PASSWORD ?? "Demo123!"}`,
    "--variable", `CLIENT_EMAIL=${process.env.CLIENT_EMAIL ?? "contacto@restauranteelbuensabor.com"}`,
    "--secret", `CLIENT_PASSWORD=${process.env.CLIENT_PASSWORD ?? "Demo123!"}`,
    file,
  ];
  const result = spawnSync("hurl", args, { stdio: "inherit", shell: process.platform === "win32" });

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
