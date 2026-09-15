import { describe, expect, it } from "vitest";
import type { ProjectContract } from "../collab.types";
import { buildContractSnapshot, hashContractSnapshot } from "./contract-template";

const contract = {
  id: "018f3c1b-5ae0-7d00-8b1c-0d1e2f3a4b5c",
  projectId: "018f3c1b-5ae0-7d00-8b1c-0d1e2f3a4b5d",
  status: "draft",
  providerKind: "cima",
  providerName: "CIMA",
  providerTaxId: "900123456-7",
  providerRepresentative: null,
  providerRepresentativeDocument: null,
  clientKind: "natural",
  clientName: "María Pérez",
  clientDocument: "1020304050",
  clientCompanyName: null,
  clientTaxId: null,
  clientRepresentative: null,
  clientRepresentativeDocument: null,
  clientEmail: "maria@example.test",
  clientPhone: null,
  planName: "Plan profesional",
  monthlyFee: 1_500_000,
  currency: "COP",
  taxIncluded: true,
  termMonths: 6,
  serviceScope: "Diseño y ejecución de la campaña digital acordada.",
  additionalTerms: "Los entregables se revisan en el espacio del proyecto.",
  contentSnapshot: null,
  contentHash: null,
  preparedBySub: "018f3c1b-5ae0-7d00-8b1c-0d1e2f3a4b5e",
  requestedSignatureAt: null,
  signedAt: null,
  signedBySub: null,
  signerName: null,
  signatureDataUrl: null,
  consentAcceptedAt: null,
  signedIpAddress: null,
  signedUserAgent: null,
  signatureCity: "Bogotá, D.C.",
  createdAt: new Date("2026-09-14T00:00:00.000Z"),
  updatedAt: new Date("2026-09-14T00:00:00.000Z"),
} satisfies ProjectContract;

describe("contract template", () => {
  it("construye una evidencia legible con las condiciones congeladas", () => {
    const snapshot = buildContractSnapshot(contract, "Campaña de lanzamiento");

    expect(snapshot).toContain("Proyecto: Campaña de lanzamiento");
    expect(snapshot).toContain("María Pérez, documento 1020304050");
    expect(snapshot).toContain("$ 1.500.000");
    expect(snapshot).toContain("Condiciones adicionales");
  });

  it("produce el mismo hash para el mismo contenido y cambia al cambiarlo", () => {
    const snapshot = buildContractSnapshot(contract, "Campaña de lanzamiento");

    expect(hashContractSnapshot(snapshot)).toHaveLength(64);
    expect(hashContractSnapshot(snapshot)).toBe(hashContractSnapshot(snapshot));
    expect(hashContractSnapshot(`${snapshot}\nCambio`)).not.toBe(hashContractSnapshot(snapshot));
  });
});
