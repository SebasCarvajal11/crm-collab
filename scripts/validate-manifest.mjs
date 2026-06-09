import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { GatewayManifestSchema } from '@sebascarvajal11/cima-contracts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const manifestPath = join(projectRoot, 'gateway', 'gateway.manifest.json');
const openapiPath = join(projectRoot, 'openapi', 'openapi.yaml');

if (!existsSync(manifestPath)) {
  console.error(`Error: Manifest file not found at ${manifestPath}`);
  process.exit(1);
}

if (!existsSync(openapiPath)) {
  console.error(`Error: OpenAPI file not found at ${openapiPath}`);
  process.exit(1);
}

try {
  const manifestRaw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  const openapiRaw = readFileSync(openapiPath, 'utf-8');
  const openapi = YAML.parse(openapiRaw);

  // Validate manifest against Zod schema from cima-contracts
  const parsed = GatewayManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    console.error('Error: Manifest does not match GatewayManifestSchema:');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  let hasErrors = false;

  for (const ep of manifest.endpoints) {
    const { endpoint, method, openapi_ref } = ep;
    if (!openapi_ref) {
      console.error(`Error: Endpoint "${method} ${endpoint}" is missing "openapi_ref"`);
      hasErrors = true;
      continue;
    }

    const parts = openapi_ref.split(' ');
    if (parts.length !== 2) {
      console.error(`Error: Invalid openapi_ref format "${openapi_ref}" for endpoint "${method} ${endpoint}". Expected format: "METHOD PATH"`);
      hasErrors = true;
      continue;
    }

    const [refMethod, refPath] = parts;
    let pathObj = openapi.paths?.[refPath];
    if (!pathObj) {
      if (refPath.endsWith('/')) {
        pathObj = openapi.paths?.[refPath.slice(0, -1)];
      } else {
        pathObj = openapi.paths?.[refPath + '/'];
      }
    }

    if (!pathObj) {
      console.error(`Error: Path "${refPath}" referenced by "${method} ${endpoint}" was not found in openapi.yaml`);
      hasErrors = true;
      continue;
    }

    const methodObj = pathObj[refMethod.toLowerCase()];
    if (!methodObj) {
      console.error(`Error: Method "${refMethod}" under path "${refPath}" referenced by "${method} ${endpoint}" was not found in openapi.yaml`);
      hasErrors = true;
      continue;
    }
  }

  if (hasErrors) {
    console.error('Validation failed with errors.');
    process.exit(1);
  }

  console.log(`✓ Manifest validation successful for service "${manifest.service}" (${manifest.endpoints.length} endpoints).`);
  process.exit(0);

} catch (err) {
  console.error('An unexpected error occurred during validation:', err);
  process.exit(1);
}
