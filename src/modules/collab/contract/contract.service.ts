import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { db } from "../../../db/connection";
import { createAuditRepository } from "../repository/audit.repository";
import { assertProjectAccess } from "../shared/project-access";
import type { GlobalRole } from "../collab.types";
import { buildContractSnapshot, hashContractSnapshot } from "./contract-template";
import { createContractRepository } from "./contract.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import type { UpsertProjectContractBody, SignProjectContractBody } from "../collab.schemas";

type Actor = { sub: string; userId: string; role: GlobalRole; email: string; bearerToken?: string };
type RequestMeta = { ipAddress: string; userAgent: string };

export const createContractService = (
  contractRepository: ReturnType<typeof createContractRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  const requireAdmin = (actor: Actor) => {
    if (actor.role !== "admin") throw new ForbiddenError("Solo administradores gestionan contratos");
  };

  return {
    getContract: async (actor: Actor, projectId: string) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      return contractRepository.getByProjectId(projectId);
    },

    saveDraft: async (actor: Actor, projectId: string, payload: UpsertProjectContractBody, meta: RequestMeta) => {
      requireAdmin(actor);
      await assertProjectAccess(accessRepo, actor, projectId);
      const current = await contractRepository.getByProjectId(projectId);
      if (current?.status === "signed") throw new BadRequestError("Un contrato firmado es inmutable; crea un nuevo proyecto o usa una adenda formal");
      if (current?.status === "pending_signature") throw new BadRequestError("No puedes editar un contrato enviado a firma; prepara un nuevo borrador antes de enviarlo");

      return db.transaction(async (tx) => {
        const contract = await createContractRepository(tx).upsertDraft({
          projectId,
          status: "draft",
          providerKind: payload.provider_kind,
          providerName: payload.provider_name,
          providerTaxId: payload.provider_tax_id?.trim() || null,
          providerRepresentative: payload.provider_representative?.trim() || null,
          providerRepresentativeDocument: payload.provider_representative_document?.trim() || null,
          clientKind: payload.client_kind,
          clientName: payload.client_name,
          clientDocument: payload.client_document?.trim() || null,
          clientCompanyName: payload.client_company_name?.trim() || null,
          clientTaxId: payload.client_tax_id?.trim() || null,
          clientRepresentative: payload.client_representative?.trim() || null,
          clientRepresentativeDocument: payload.client_representative_document?.trim() || null,
          clientEmail: payload.client_email,
          clientPhone: payload.client_phone?.trim() || null,
          planName: payload.plan_name,
          monthlyFee: payload.monthly_fee,
          currency: payload.currency,
          taxIncluded: payload.tax_included,
          termMonths: payload.term_months,
          serviceScope: payload.service_scope,
          additionalTerms: payload.additional_terms?.trim() || null,
          contentSnapshot: null,
          contentHash: null,
          preparedBySub: actor.sub,
          requestedSignatureAt: null,
          signedAt: null,
          signedBySub: null,
          signerName: null,
          signatureDataUrl: null,
          consentAcceptedAt: null,
          signedIpAddress: null,
          signedUserAgent: null,
          signatureCity: payload.signature_city,
        });
        await createAuditRepository(tx).createAuditLog({ actorSub: actor.sub, action: "project_contract_draft_saved", resourceType: "project_contract", resourceId: contract.id, ipAddress: meta.ipAddress, userAgent: meta.userAgent, details: { projectId } });
        return contract;
      });
    },

    requestSignature: async (actor: Actor, projectId: string, meta: RequestMeta) => {
      requireAdmin(actor);
      const { project } = await assertProjectAccess(accessRepo, actor, projectId);
      const current = await contractRepository.getByProjectId(projectId);
      if (!current) throw new NotFoundError("Primero debes preparar el borrador del contrato");
      if (current.status !== "draft") throw new BadRequestError("Solo los borradores pueden enviarse a firma");
      const snapshot = buildContractSnapshot(current, project.name);
      const contentHash = hashContractSnapshot(snapshot);
      return db.transaction(async (tx) => {
        const contract = await createContractRepository(tx).requestSignature(projectId, snapshot, contentHash);
        if (!contract) throw new NotFoundError("Contrato no encontrado");
        await createAuditRepository(tx).createAuditLog({ actorSub: actor.sub, action: "project_contract_signature_requested", resourceType: "project_contract", resourceId: contract.id, ipAddress: meta.ipAddress, userAgent: meta.userAgent, details: { projectId, contentHash } });
        return contract;
      });
    },

    sign: async (actor: Actor, projectId: string, payload: SignProjectContractBody, meta: RequestMeta) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (actor.role !== "client" || member?.role !== "client") throw new ForbiddenError("Solo el cliente asignado al proyecto puede firmar el contrato");
      const current = await contractRepository.getByProjectId(projectId);
      if (!current) throw new NotFoundError("Contrato no encontrado");
      if (current.status !== "pending_signature" || !current.contentSnapshot || !current.contentHash) throw new BadRequestError("El contrato no está disponible para firma");
      return db.transaction(async (tx) => {
        const contract = await createContractRepository(tx).sign(projectId, { signedBySub: actor.sub, signerName: payload.signer_name, signatureDataUrl: payload.signature_data_url, signedIpAddress: meta.ipAddress, signedUserAgent: meta.userAgent });
        if (!contract) throw new NotFoundError("Contrato no encontrado");
        await createAuditRepository(tx).createAuditLog({ actorSub: actor.sub, action: "project_contract_signed", resourceType: "project_contract", resourceId: contract.id, ipAddress: meta.ipAddress, userAgent: meta.userAgent, details: { projectId, contentHash: current.contentHash, consentAcceptedAt: contract.consentAcceptedAt?.toISOString() } });
        return contract;
      });
    },
  };
};
