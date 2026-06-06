import { createMiddleware } from "hono/factory";
import { env } from "../../config/env";
import { ForbiddenError, UnauthorizedError } from "./error-handler.middleware";
import { getLogger } from "../logger";
import { JwksClient } from "../../config/jwks-client";

const logger = getLogger();

type GlobalRole = "admin" | "worker" | "client";

export interface JwtPayload {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  exp: number;
  iat?: number;
  iss?: string;
  kid?: string;
}

export type AppEnv = {
  Variables: {
    user: JwtPayload;
  };
};

const normalizePem = (pem: string) => pem.replace(/\\n/g, "\n").trim();

const isRole = (role: string): role is GlobalRole =>
  role === "admin" || role === "worker" || role === "client";

/**
 * Instancia compartida del cliente JWKS.
 * Se inicializa solo si JWKS_URI está configurada y JWT_PUBLIC_KEY no.
 */
const jwksClient: JwksClient | null =
  !env.JWT_PUBLIC_KEY && env.JWKS_URI
    ? new JwksClient(env.JWKS_URI, env.JWKS_CACHE_TTL_MS)
    : null;

/**
 * Decodifica el header JWT sin verificar firma para extraer el `kid`.
 * Necesario para seleccionar la clave correcta del JWKS.
 */
const decodeJwtHeader = (token: string): { kid?: string; alg?: string } => {
  const [headerB64] = token.split(".");
  if (!headerB64) return {};
  try {
    return JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf8")
    ) as { kid?: string; alg?: string };
  } catch {
    return {};
  }
};

/**
 * Verifica un JWT RS256 con una clave PEM SPKI usando la API nativa de Node.js.
 * Se usa en lugar de `hono/jwt verify()` para compatibilidad con la clave
 * obtenida del JWKS (ya convertida a PEM) sin necesitar un import adicional.
 */
const verifyRs256 = async (
  token: string,
  publicKeyPem: string,
  expectedIss?: string
): Promise<JwtPayload> => {
  const { createVerify, createPublicKey } = await import("node:crypto");
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error("Token JWT malformado");
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8")
  ) as JwtPayload;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Token expirado");
  }
  if (expectedIss && payload.iss !== expectedIss) {
    throw new Error("Issuer no coincide");
  }

  const key = createPublicKey(publicKeyPem);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(
    key,
    Buffer.from(signatureB64, "base64url")
  );
  if (!valid) {
    throw new Error("Firma JWT inválida");
  }

  return payload;
};

const fromGatewayHeaders = (c: {
  req: { header: (name: string) => string | undefined };
}): JwtPayload | null => {
  if (!env.TRUST_GATEWAY_JWT_HEADERS) return null;
  if (c.req.header("X-Gateway-Trust") !== env.GATEWAY_TRUST_SECRET) return null;

  const sub = c.req.header("X-User-Sub")?.trim();
  const userId = c.req.header("X-User-Id")?.trim();
  const role = c.req.header("X-User-Role")?.trim();
  const email = c.req.header("X-User-Email")?.trim();
  const expRaw = c.req.header("X-Token-Exp")?.trim();

  if (!sub || !userId || !role || !email || !isRole(role)) return null;

  const expParsed = expRaw ? Number.parseInt(expRaw, 10) : Number.NaN;
  const exp = Number.isFinite(expParsed)
    ? expParsed
    : Math.floor(Date.now() / 1000) + 900;
  return { sub, userId, role, email, exp };
};

/**
 * Verifica el token directamente con JWT_PUBLIC_KEY (PEM estático) o con
 * el cliente JWKS (clave dinámica cacheada desde crm-auth/.well-known/jwks.json).
 */
const verifyTokenDirectly = async (token: string): Promise<JwtPayload> => {
  if (env.JWT_PUBLIC_KEY) {
    return verifyRs256(token, normalizePem(env.JWT_PUBLIC_KEY), env.JWT_ISS);
  }

  if (jwksClient) {
    const { kid } = decodeJwtHeader(token);
    const pem = kid
      ? await jwksClient.getPublicKeyPem(kid)
      : (await jwksClient.getAllPublicKeyPems()).values().next().value;

    if (!pem) {
      throw new UnauthorizedError("No se encontró clave pública en JWKS");
    }
    return verifyRs256(token, pem, env.JWT_ISS);
  }

  throw new UnauthorizedError(
    "Validación directa no disponible: configure JWT_PUBLIC_KEY o JWKS_URI"
  );
};

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (env.TRUST_GATEWAY_JWT_HEADERS) {
    const trustHeader = c.req.header("X-Gateway-Trust");
    if (!trustHeader) {
      logger.warn(
        "[auth] X-Gateway-Trust header missing — falling back to JWT verification"
      );
    } else if (trustHeader !== env.GATEWAY_TRUST_SECRET) {
      logger.warn(
        "[auth] X-Gateway-Trust mismatch — falling back to JWT verification"
      );
    }
  }

  const headerPayload = fromGatewayHeaders(c);
  if (headerPayload) {
    c.set("user", headerPayload);
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Se requiere token Bearer");
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyTokenDirectly(token);
    if (
      !payload.sub ||
      !payload.userId ||
      !payload.email ||
      !payload.role ||
      !isRole(payload.role)
    ) {
      throw new UnauthorizedError("Claims JWT incompletos");
    }
    c.set("user", payload);
    await next();
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Token inválido o expirado");
  }
});

export const requireGlobalRole = (...roles: GlobalRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenError(`Acceso restringido a: ${roles.join(", ")}`);
    }
    await next();
  });
