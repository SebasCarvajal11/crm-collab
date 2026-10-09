import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetByProjectId = vi.fn();
const mockUpsertDraft = vi.fn();
const mockRequestSignature = vi.fn();
const mockSign = vi.fn();
const mockCreateAuditLog = vi.fn();

vi.mock("../../../db/connection", () => ({
  db: {
    transaction: vi.fn(async (cb) => cb({})),
  },
}));

vi.mock("./contract.repository", () => ({
  createContractRepository: () => ({
    getByProjectId: mockGetByProjectId,
    upsertDraft: mockUpsertDraft,
    requestSignature: mockRequestSignature,
    sign: mockSign,
    listAmendmentsByProjectId: vi.fn().mockResolvedValue([]),
    getAmendmentById: vi.fn().mockResolvedValue(null),
    getNextAmendmentNumber: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("../repository/audit.repository", () => ({
  createAuditRepository: () => ({
    createAuditLog: mockCreateAuditLog,
  }),
}));

import { createContractService } from "./contract.service";

describe("ContractService", () => {
  const projectRepo = {
    findProjectById: vi.fn().mockResolvedValue({ id: "p-1", name: "Redes CIMA" }),
  } as any;
  const memberRepo = {
    findProjectMember: vi.fn(),
    listProjectMembers: vi.fn().mockResolvedValue([]),
  } as any;
  const contractRepo = {
    getByProjectId: mockGetByProjectId,
    upsertDraft: mockUpsertDraft,
    requestSignature: mockRequestSignature,
    sign: mockSign,
    listAmendmentsByProjectId: vi.fn().mockResolvedValue([]),
  } as any;

  const adminActor = { sub: "admin-1", userId: "admin-1", role: "admin" as const, email: "admin@cima.dev" };
  const clientActor = { sub: "client-1", userId: "client-1", role: "client" as const, email: "client@cima.dev" };
  const meta = { ipAddress: "127.0.0.1", userAgent: "vitest" };

  const baseContract = {
    id: "c-1",
    projectId: "p-1",
    status: "draft",
    providerKind: "cima",
    providerName: "CIMA S.A.S.",
    providerTaxId: "900123456-1",
    providerRepresentative: "Carlos CIMA",
    providerRepresentativeDocument: "102030",
    clientKind: "natural",
    clientName: "Ana Gómez",
    clientDocument: "556677",
    clientCompanyName: null,
    clientTaxId: null,
    clientRepresentative: null,
    clientRepresentativeDocument: null,
    clientEmail: "ana@cima.dev",
    clientPhone: "3001234567",
    planName: "Plan Pro",
    monthlyFee: 1500000,
    currency: "COP",
    taxIncluded: true,
    termMonths: 6,
    serviceScope: "Gestión de redes sociales mensual.",
    additionalTerms: null,
    signatureCity: "Bogotá, D.C.",
    contentSnapshot: null,
    contentHash: null,
    preparedBySub: "admin-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    memberRepo.findProjectMember.mockResolvedValue({ role: "client", userSub: "client-1" });
  });

  it("getContract genera contentSnapshot y hash si el contrato en base de datos carece de ellos", async () => {
    mockGetByProjectId.mockResolvedValue(baseContract);
    const service = createContractService(contractRepo, projectRepo, memberRepo);

    const result = await service.getContract(adminActor, "p-1");

    expect(result).not.toBeNull();
    expect(result?.contentSnapshot).toContain("Proyecto: Redes CIMA");
    expect(result?.contentSnapshot).toContain("Ana Gómez, documento 556677");
    expect(result?.contentHash).toHaveLength(64);
  });

  it("saveDraft congela snapshot y hash canónico en el borrador", async () => {
    mockGetByProjectId.mockResolvedValue(null);
    mockUpsertDraft.mockImplementation((payload) => Promise.resolve({ id: "c-new", ...payload }));
    const service = createContractService(contractRepo, projectRepo, memberRepo);

    const draft = await service.saveDraft(
      adminActor,
      "p-1",
      {
        provider_kind: "cima",
        provider_name: "CIMA S.A.S.",
        provider_tax_id: "900123456-1",
        provider_representative: "Carlos CIMA",
        provider_representative_document: "102030",
        client_kind: "natural",
        client_name: "Ana Gómez",
        client_document: "556677",
        client_email: "ana@cima.dev",
        plan_name: "Plan Pro",
        monthly_fee: 1500000,
        currency: "COP",
        tax_included: true,
        term_months: 6,
        service_scope: "Gestión de redes sociales mensual.",
        signature_city: "Bogotá, D.C.",
      },
      meta,
    );

    expect(mockUpsertDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        contentSnapshot: expect.stringContaining("Proyecto: Redes CIMA"),
        contentHash: expect.any(String),
      }),
    );
    expect(draft.contentHash).toHaveLength(64);
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_contract_draft_saved",
        details: expect.objectContaining({ contentHash: expect.any(String) }),
      }),
    );
  });

  it("sign permite a contratos legacy sin snapshot congelar evidencia canónica al firmar", async () => {
    mockGetByProjectId.mockResolvedValue({
      ...baseContract,
      status: "pending_signature",
      contentSnapshot: null,
      contentHash: null,
    });
    mockSign.mockImplementation((_pid, payload) =>
      Promise.resolve({
        id: "c-1",
        status: "signed",
        ...payload,
        consentAcceptedAt: new Date(),
      }),
    );

    const service = createContractService(contractRepo, projectRepo, memberRepo);
    const mockSigPng =
      "data:image/png;base64," +
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const signed = await service.sign(
      clientActor,
      "p-1",
      {
        signer_name: "Ana Gómez",
        signature_data_url: mockSigPng,
        accept_terms: true,
      },
      meta,
    );

    expect(mockSign).toHaveBeenCalledWith(
      "p-1",
      expect.objectContaining({
        signerName: "Ana Gómez",
        contentSnapshot: expect.stringContaining("Proyecto: Redes CIMA"),
        contentHash: expect.any(String),
      }),
    );
    expect(signed.status).toBe("signed");
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_contract_signed",
        details: expect.objectContaining({ contentHash: expect.any(String) }),
      }),
    );
  });
});
