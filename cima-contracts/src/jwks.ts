import { createPublicKey } from "node:crypto";
import { withRetry } from "./retry";

export interface JwkEntry {
  kid: string;
  alg: string;
  use: string;
  kty: string;
  n?: string;
  e?: string;
}

interface JwksDocument {
  keys: JwkEntry[];
}

interface CacheEntry {
  pems: Map<string, string>;
  expiresAt: number;
}

export class JwksClient {
  private readonly jwksUri: string;
  private readonly cacheTtlMs: number;
  private cache: CacheEntry | null = null;

  constructor(jwksUri: string, cacheTtlMs = 5 * 60 * 1000) {
    this.jwksUri = jwksUri;
    this.cacheTtlMs = cacheTtlMs;
  }

  async getPublicKeyPem(kid: string): Promise<string> {
    const pems = await this.getPems();
    const pem = pems.get(kid);
    if (!pem) {
      const refreshed = await this.fetchAndCache();
      const retried = refreshed.get(kid);
      if (!retried) {
        throw new Error(`JWKS: clave no encontrada para kid="${kid}"`);
      }
      return retried;
    }
    return pem;
  }

  async getAllPublicKeyPems(): Promise<Map<string, string>> {
    return this.getPems();
  }

  private async getPems(): Promise<Map<string, string>> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.pems;
    }
    return this.fetchAndCache();
  }

  private async fetchAndCache(): Promise<Map<string, string>> {
    const response = await withRetry(async () => {
      const res = await fetch(this.jwksUri, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        const error: any = new Error(`HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }
      return res;
    }, {
      maxAttempts: 3,
      delayMs: 150,
    });

    const body = (await response.json()) as JwksDocument;
    if (!Array.isArray(body?.keys)) {
      throw new Error("JWKS: respuesta inválida, falta propiedad 'keys'");
    }

    const pems = new Map<string, string>();
    for (const jwk of body.keys) {
      if (jwk.use !== "sig" || !jwk.kid) continue;
      const nodeKey = createPublicKey({
        key: jwk as unknown as import("node:crypto").JsonWebKey,
        format: "jwk",
      });
      const pem = nodeKey.export({ type: "spki", format: "pem" }) as string;
      pems.set(jwk.kid, pem);
    }

    if (pems.size === 0) {
      throw new Error("JWKS: ninguna clave de firma válida encontrada");
    }

    this.cache = { pems, expiresAt: Date.now() + this.cacheTtlMs };
    return pems;
  }
}
