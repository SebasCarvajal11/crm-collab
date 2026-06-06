import { describe, it, expect, vi, beforeEach } from "vitest";
import { JwksClient } from "../../src/config/jwks-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeJwkEntry = (kid: string) => ({
  kty: "RSA",
  use: "sig",
  alg: "RS256",
  kid,
  // Valores mínimos que createPublicKey({ format: 'jwk' }) acepta para RSA
  n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
  e: "AQAB",
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const buildFetchMock = (kids: string[], status = 200) => {
  const keys = kids.map(makeJwkEntry);
  return vi.fn().mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => ({ keys }),
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JwksClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("obtiene y cachea claves del endpoint JWKS", async () => {
    const fetchMock = buildFetchMock(["kid-1"]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new JwksClient("http://auth:3000/.well-known/jwks.json");
    const pems = await client.getAllPublicKeyPems();

    expect(pems.has("kid-1")).toBe(true);
    expect(typeof pems.get("kid-1")).toBe("string");
    expect(pems.get("kid-1")).toContain("BEGIN PUBLIC KEY");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Segunda llamada dentro del TTL — NO debe llamar a fetch de nuevo
    await client.getAllPublicKeyPems();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("busca por kid correctamente", async () => {
    const fetchMock = buildFetchMock(["kid-1", "kid-2"]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new JwksClient("http://auth:3000/.well-known/jwks.json");
    const pem = await client.getPublicKeyPem("kid-1");

    expect(pem).toContain("BEGIN PUBLIC KEY");
  });

  it("lanza error si el kid no existe en el JWKS", async () => {
    const fetchMock = buildFetchMock(["kid-1"]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new JwksClient("http://auth:3000/.well-known/jwks.json");

    await expect(client.getPublicKeyPem("kid-desconocido")).rejects.toThrow(
      /clave no encontrada para kid/
    );
    // Debe haber intentado refrescar (2 fetches en total: inicial + refresh)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refresca el caché cuando el TTL expira", async () => {
    vi.useFakeTimers();
    const fetchMock = buildFetchMock(["kid-1"]);
    vi.stubGlobal("fetch", fetchMock);

    const ttlMs = 10_000;
    const client = new JwksClient("http://auth:3000/.well-known/jwks.json", ttlMs);

    await client.getAllPublicKeyPems();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Avanzar el tiempo más allá del TTL
    vi.advanceTimersByTime(ttlMs + 1);

    await client.getAllPublicKeyPems();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("lanza error si la respuesta HTTP no es 200", async () => {
    const fetchMock = buildFetchMock([], 503);
    vi.stubGlobal("fetch", fetchMock);

    const client = new JwksClient("http://auth:3000/.well-known/jwks.json");
    await expect(client.getAllPublicKeyPems()).rejects.toThrow(/JWKS fetch fallido: HTTP 503/);
  });

  it("lanza error si la respuesta no contiene 'keys'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ notKeys: [] }),
    }));

    const client = new JwksClient("http://auth:3000/.well-known/jwks.json");
    await expect(client.getAllPublicKeyPems()).rejects.toThrow(/respuesta inválida/);
  });

  it("ignora claves que no son de firma (use != sig)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        keys: [
          { ...makeJwkEntry("kid-enc"), use: "enc" },
          { ...makeJwkEntry("kid-sig"), use: "sig" },
        ],
      }),
    }));

    const client = new JwksClient("http://auth:3000/.well-known/jwks.json");
    const pems = await client.getAllPublicKeyPems();

    expect(pems.has("kid-sig")).toBe(true);
    expect(pems.has("kid-enc")).toBe(false);
  });
});
