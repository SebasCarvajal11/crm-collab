import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage/unit",
      include: [
        "src/modules/collab/domain/**/*.ts",
        "src/modules/collab/shared/guards.ts",
        "src/modules/collab/shared/project-access.ts",
        "src/modules/collab/shared/mappers.ts",
      ],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85,
      },
    },
  },
});
