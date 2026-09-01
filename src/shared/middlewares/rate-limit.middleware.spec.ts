import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { AppError } from "./error-handler.middleware";

vi.mock("../redis", () => ({ getRedisConnection: () => null }));
vi.mock("../../config/env", () => ({
  env: {
    RATE_LIMIT_COLLAB_CHAT_MAX: 2,
    RATE_LIMIT_COLLAB_CHAT_WINDOW_MS: 60_000,
    RATE_LIMIT_COLLAB_FILE_UPLOAD_MAX: 2,
    RATE_LIMIT_COLLAB_FILE_UPLOAD_WINDOW_MS: 60_000,
    RATE_LIMIT_COLLAB_PROJECT_MAX: 2,
    RATE_LIMIT_COLLAB_PROJECT_WINDOW_MS: 60_000,
    RATE_LIMIT_COLLAB_DEFAULT_MAX: 2,
    RATE_LIMIT_COLLAB_DEFAULT_WINDOW_MS: 60_000,
  },
}));

import { collabWriteRateLimit, matchedWriteRoute } from "./rate-limit.middleware";

describe("collabWriteRateLimit", () => {
  it("shares one bucket across dynamic identifiers of the same write route", async () => {
    const app = new Hono();
    app.onError((error, c) => c.text("error", error instanceof AppError ? 429 : 500));
    app.use("*", collabWriteRateLimit());
    const matchedPaths: string[] = [];
    app.use("*", async (c, next) => {
      matchedPaths.push(matchedWriteRoute(c as any));
      await next();
    });
    app.patch("/collab/projects/:projectId", (c) => c.text("ok"));

    for (let index = 0; index < 2; index += 1) {
      const response = await app.request(`/collab/projects/project-${index}`, {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      });
      expect(response.status).toBe(200);
    }

    expect(new Set(matchedPaths)).toEqual(new Set(["/collab/projects/:projectId"]));

    const limited = await app.request("/collab/projects/project-3", {
      method: "PATCH",
      headers: { "x-user-id": "user-1" },
    });
    expect(limited.status).toBe(429);
  });
});
