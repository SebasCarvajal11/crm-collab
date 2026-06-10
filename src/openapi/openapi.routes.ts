import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveModuleRoot(): string {
  const fromSrcTree = join(__dirname, "..", "..");
  if (existsSync(join(fromSrcTree, "openapi", "openapi.yaml"))) return fromSrcTree;
  const fromDistTree = join(__dirname, "..", "..", "..");
  if (existsSync(join(fromDistTree, "openapi", "openapi.yaml"))) return fromDistTree;
  return process.cwd();
}

const swaggerUiHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>mod-collab - OpenAPI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" crossorigin />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: window.location.origin + "/api/v1/openapi.yaml",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout",
      });
    };
  </script>
</body>
</html>`;

export const createOpenApiRoutes = () => {
  const routes = new Hono();
  routes.get("/openapi.yaml", (c) => {
    const path = join(resolveModuleRoot(), "openapi", "openapi.yaml");
    if (!existsSync(path)) {
      return c.json({ error: "No se encontro openapi/openapi.yaml" }, 404);
    }
    return c.body(readFileSync(path), 200, {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "public, max-age=120",
    });
  });
  routes.get("/docs", (c) => c.html(swaggerUiHtml));
  return routes;
};
