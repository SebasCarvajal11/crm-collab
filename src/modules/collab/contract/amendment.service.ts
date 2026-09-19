import { BadRequestError, ForbiddenError, NotFoundError } from '../../../shared/middlewares/error-handler.middleware'
import { db } from '../../../db/connection'
import { createAuditRepository } from '../repository/audit.repository'
import { assertProjectAccess } from '../shared/project-access'
import type { GlobalRole } from '../collab.types'
import { buildAmendmentSnapshot, hashAmendmentSnapshot } from './amendment-template'
import { createContractRepository } from './contract.repository'
import type { createProjectRepository } from '../project/project.repository'
import type { createMemberRepository } from '../member/member.repository'
import type {
  CreateAmendmentDraftBody,
  RequestClientAmendmentBody,
  SignAmendmentBody,
} from '../collab.schemas'

export type Actor = { sub: string; userId: string; role: GlobalRole; email: string; bearerToken?: string }
export type RequestMeta = { ipAddress: string; userAgent: string }

type AccessRepo = {
  findProjectById: ReturnType<typeof createProjectRepository>['findProjectById']
  findProjectMember: ReturnType<typeof createMemberRepository>['findProjectMember']
  listProjectMembers: ReturnType<typeof createMemberRepository>['listProjectMembers']
}

export const createAmendmentService = (
  contractRepository: ReturnType<typeof createContractRepository>,
  accessRepo: AccessRepo,
  requireAdmin: (actor: Actor) => void,
) => ({
  listAmendments: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(accessRepo, actor, projectId)
    return contractRepository.listAmendmentsByProjectId(projectId)
  },

  saveAmendmentDraft: async (
    actor: Actor,
    projectId: string,
    payload: CreateAmendmentDraftBody,
    meta: RequestMeta,
  ) => {
    requireAdmin(actor)
    await assertProjectAccess(accessRepo, actor, projectId)
    const currentContract = await contractRepository.getByProjectId(projectId)
    if (!currentContract || currentContract.status !== 'signed') {
      throw new BadRequestError('El contrato principal debe estar firmado antes de formalizar un Otrosí')
    }

    return db.transaction(async (tx) => {
      const txRepo = createContractRepository(tx)
      const nextNumber = await txRepo.getNextAmendmentNumber(currentContract.id)
      const amendment = await txRepo.createAmendmentDraft({
        contractId: currentContract.id,
        projectId,
        amendmentNumber: nextNumber,
        title: payload.title,
        amendmentType: payload.amendment_type,
        status: 'draft',
        serviceScope: payload.service_scope,
        additionalFee: payload.additional_fee,
        feePaymentType: payload.fee_payment_type,
        termMonthsExtension: payload.term_months_extension,
        additionalTerms: payload.additional_terms?.trim() || null,
        clientRequestNotes: payload.client_request_notes?.trim() || null,
        signatureCity: payload.signature_city,
        preparedBySub: actor.sub,
      })

      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: 'project_contract_amendment_draft_saved',
        resourceType: 'project_contract_amendment',
        resourceId: amendment.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { projectId, amendmentNumber: nextNumber },
      })
      return amendment
    })
  },

  requestClientAmendment: async (
    actor: Actor,
    projectId: string,
    payload: RequestClientAmendmentBody,
    meta: RequestMeta,
  ) => {
    await assertProjectAccess(accessRepo, actor, projectId)
    const currentContract = await contractRepository.getByProjectId(projectId)
    if (!currentContract || currentContract.status !== 'signed') {
      throw new BadRequestError('El contrato principal debe estar firmado para solicitar adiciones')
    }

    return db.transaction(async (tx) => {
      const txRepo = createContractRepository(tx)
      const nextNumber = await txRepo.getNextAmendmentNumber(currentContract.id)
      const amendment = await txRepo.createAmendmentDraft({
        contractId: currentContract.id,
        projectId,
        amendmentNumber: nextNumber,
        title: payload.title,
        amendmentType: 'services',
        status: 'draft',
        serviceScope: payload.description,
        additionalFee: 0,
        feePaymentType: 'one_time',
        termMonthsExtension: 0,
        clientRequestNotes: `Solicitud originada por el cliente: ${payload.description}`,
        signatureCity: currentContract.signatureCity,
        preparedBySub: actor.sub,
      })

      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: 'project_contract_amendment_requested_by_client',
        resourceType: 'project_contract_amendment',
        resourceId: amendment.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { projectId, title: payload.title },
      })
      return amendment
    })
  },

  requestAmendmentSignature: async (
    actor: Actor,
    projectId: string,
    amendmentId: string,
    meta: RequestMeta,
  ) => {
    requireAdmin(actor)
    const { project } = await assertProjectAccess(accessRepo, actor, projectId)
    const currentContract = await contractRepository.getByProjectId(projectId)
    if (!currentContract || currentContract.status !== 'signed') {
      throw new BadRequestError('El contrato principal no es válido o no está firmado')
    }
    const amendment = await contractRepository.getAmendmentById(projectId, amendmentId)
    if (!amendment) throw new NotFoundError('Otrosí no encontrado')
    if (amendment.status !== 'draft') {
      throw new BadRequestError('Solo se pueden solicitar firmas para Otrosíes en estado borrador')
    }

    const snapshot = buildAmendmentSnapshot(amendment, currentContract, project.name)
    const contentHash = hashAmendmentSnapshot(snapshot)

    return db.transaction(async (tx) => {
      const updated = await createContractRepository(tx).requestAmendmentSignature(
        amendmentId,
        snapshot,
        contentHash,
      )
      if (!updated) throw new NotFoundError('Otrosí no encontrado')
      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: 'project_contract_amendment_signature_requested',
        resourceType: 'project_contract_amendment',
        resourceId: amendmentId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { projectId, amendmentNumber: amendment.amendmentNumber, contentHash },
      })
      return updated
    })
  },

  signAmendment: async (
    actor: Actor,
    projectId: string,
    amendmentId: string,
    payload: SignAmendmentBody,
    meta: RequestMeta,
  ) => {
    const { member } = await assertProjectAccess(accessRepo, actor, projectId)
    if (actor.role !== 'client' || member?.role !== 'client') {
      throw new ForbiddenError('Solo el cliente asignado al proyecto puede firmar el Otrosí')
    }
    const amendment = await contractRepository.getAmendmentById(projectId, amendmentId)
    if (!amendment) throw new NotFoundError('Otrosí no encontrado')
    if (amendment.status !== 'pending_signature' || !amendment.contentSnapshot || !amendment.contentHash) {
      throw new BadRequestError('El Otrosí no está habilitado para firma')
    }

    return db.transaction(async (tx) => {
      const signed = await createContractRepository(tx).signAmendment(amendmentId, {
        signedBySub: actor.sub,
        signerName: payload.signer_name,
        signatureDataUrl: payload.signature_data_url,
        signedIpAddress: meta.ipAddress,
        signedUserAgent: meta.userAgent,
      })
      if (!signed) throw new NotFoundError('Otrosí no encontrado')
      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: 'project_contract_amendment_signed',
        resourceType: 'project_contract_amendment',
        resourceId: amendmentId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { projectId, amendmentNumber: amendment.amendmentNumber, contentHash: amendment.contentHash },
      })
      return signed
    })
  },
})
