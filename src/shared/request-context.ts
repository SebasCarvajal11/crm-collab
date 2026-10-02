import type { Context } from "hono";
import { getTrustedClientIp } from "@sebascarvajal11/cima-contracts/hono-security-middleware";

export const getIp = (c: Context) => getTrustedClientIp(c);
export const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
