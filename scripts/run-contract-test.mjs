import { spawnSync } from "node:child_process";

const result = spawnSync(
  "hurl",
  [
    "--test",
    "--variable", "base_url=http://localhost:28080",
    "--variable", "LOGIN_IP=127.0.0.1",
    "--variable", `TEST_SUFFIX=contract_${Date.now()}`,
    "--variable", "WORKER_EMAIL=ana.martinez@cima.dev",
    "--variable", "WORKER_PASSWORD=Demo123!",
    "--variable", "CLIENT_EMAIL=contacto@restauranteelbuensabor.com",
    "--variable", "CLIENT_PASSWORD=Demo123!",
    "tests/01_gateway_rbac_collab.hurl",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(result.status ?? 1);
