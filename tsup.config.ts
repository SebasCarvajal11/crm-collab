import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    "workers/collab.worker": "src/workers/collab.worker.ts",
  },
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
  noExternal: ["@sebascarvajal11/cima-contracts"],
});
