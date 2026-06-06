import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const specPath = resolve("openapi", "openapi.yaml");

if (!existsSync(specPath)) {
  throw new Error(`No se encontro la especificacion OpenAPI en ${specPath}`);
}

const outDir = mkdtempSync(join(tmpdir(), "crm-collab-openapi-"));
const outFile = join(outDir, "openapi.d.ts");

try {
  const ast = await openapiTS(pathToFileURL(specPath), { silent: true });
  writeFileSync(outFile, astToString(ast));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
