import { Hono } from "hono";
import { authMiddleware, requireRole, type AppEnv } from "../../../shared/middlewares/auth.middleware";
import { adminStorageController } from "./admin-storage.controller";

export const adminStorageRoutes = new Hono<AppEnv>();

adminStorageRoutes.use("*", authMiddleware);
adminStorageRoutes.use("*", requireRole("admin"));

adminStorageRoutes.get("/tree", adminStorageController.getStorageTree);
adminStorageRoutes.delete("/files/:fileId", adminStorageController.purgeFile);
adminStorageRoutes.post("/purge", adminStorageController.purgeBatch);
