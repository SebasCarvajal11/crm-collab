import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveModuleRoot() {
  const candidates = [
    process.cwd(),
    resolve(moduleDir, "../.."),
    resolve(moduleDir, "../../.."),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "gateway", "endpoints.json"))) {
      return candidate;
    }
  }

  return process.cwd();
}

export function createGatewayRoutes() {
  const routes = new Hono();

  routes.get("/_gateway/endpoints.json", (c) => {
    const path = join(resolveModuleRoot(), "gateway", "endpoints.json");
    if (!existsSync(path)) {
      return c.json({ error: "No se encontro gateway/endpoints.json" }, 404);
    }

    const raw = readFileSync(path, "utf-8");
    JSON.parse(raw);

    return c.body(raw, 200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
  });

  return routes;
}
