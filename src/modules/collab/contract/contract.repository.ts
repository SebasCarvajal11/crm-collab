import { eq, and, desc, sql } from 'drizzle-orm'
import { projectContracts, projectContractAmendments } from '../../../db/schema'
import type { DbOrTx } from '../shared/db.types'
import type { NewProjectContract } from '../collab.types'

export type NewProjectContractAmendment = typeof projectContractAmendments.$inferInsert
export type ProjectContractAmendmentRow = typeof projectContractAmendments.$inferSelect

export const createContractRepository = (conn: DbOrTx) => ({
  getByProjectId: async (projectId: string) => {
    const [row] = await conn
      .select()
      .from(projectContracts)
      .where(eq(projectContracts.projectId, projectId))
      .limit(1)
    return row ?? null
  },

  upsertDraft: async (payload: NewProjectContract) => {
    const [row] = await conn
      .insert(projectContracts)
      .values(payload)
      .onConflictDoUpdate({
        target: [projectContracts.projectId],
        set: { ...payload, updatedAt: new Date() },
      })
      .returning()
    return row
  },

  requestSignature: async (projectId: string, contentSnapshot: string, contentHash: string) => {
    const [row] = await conn
      .update(projectContracts)
      .set({
        status: 'pending_signature',
        contentSnapshot,
        contentHash,
        requestedSignatureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectContracts.projectId, projectId))
      .returning()
    return row ?? null
  },

  sign: async (
    projectId: string,
    payload: Pick<
      NewProjectContract,
      'signedBySub' | 'signerName' | 'signatureDataUrl' | 'signedIpAddress' | 'signedUserAgent'
    >,
  ) => {
    const now = new Date()
    const [row] = await conn
      .update(projectContracts)
      .set({
        status: 'signed',
        signedBySub: payload.signedBySub,
        signerName: payload.signerName,
        signatureDataUrl: payload.signatureDataUrl,
        signedIpAddress: payload.signedIpAddress,
        signedUserAgent: payload.signedUserAgent,
        signedAt: now,
        consentAcceptedAt: now,
        updatedAt: now,
      })
      .where(eq(projectContracts.projectId, projectId))
      .returning()
    return row ?? null
  },

  listAmendmentsByProjectId: async (projectId: string): Promise<ProjectContractAmendmentRow[]> => {
    return conn
      .select()
      .from(projectContractAmendments)
      .where(eq(projectContractAmendments.projectId, projectId))
      .orderBy(desc(projectContractAmendments.amendmentNumber))
  },

  getAmendmentById: async (
    projectId: string,
    amendmentId: string,
  ): Promise<ProjectContractAmendmentRow | null> => {
    const [row] = await conn
      .select()
      .from(projectContractAmendments)
      .where(
        and(
          eq(projectContractAmendments.projectId, projectId),
          eq(projectContractAmendments.id, amendmentId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  getNextAmendmentNumber: async (contractId: string): Promise<number> => {
    const [result] = await conn
      .select({
        maxNumber: sql<number>`COALESCE(MAX(${projectContractAmendments.amendmentNumber}), 0)`,
      })
      .from(projectContractAmendments)
      .where(eq(projectContractAmendments.contractId, contractId))
    return (result?.maxNumber ?? 0) + 1
  },

  createAmendmentDraft: async (
    payload: NewProjectContractAmendment,
  ): Promise<ProjectContractAmendmentRow> => {
    const [row] = await conn
      .insert(projectContractAmendments)
      .values(payload)
      .returning()
    return row
  },

  requestAmendmentSignature: async (
    amendmentId: string,
    contentSnapshot: string,
    contentHash: string,
  ): Promise<ProjectContractAmendmentRow | null> => {
    const [row] = await conn
      .update(projectContractAmendments)
      .set({
        status: 'pending_signature',
        contentSnapshot,
        contentHash,
        requestedSignatureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectContractAmendments.id, amendmentId))
      .returning()
    return row ?? null
  },

  signAmendment: async (
    amendmentId: string,
    payload: {
      signedBySub: string
      signerName: string
      signatureDataUrl: string
      signedIpAddress: string
      signedUserAgent: string
    },
  ): Promise<ProjectContractAmendmentRow | null> => {
    const now = new Date()
    const [row] = await conn
      .update(projectContractAmendments)
      .set({
        status: 'signed',
        signedBySub: payload.signedBySub,
        signerName: payload.signerName,
        signatureDataUrl: payload.signatureDataUrl,
        signedIpAddress: payload.signedIpAddress,
        signedUserAgent: payload.signedUserAgent,
        signedAt: now,
        consentAcceptedAt: now,
        updatedAt: now,
      })
      .where(eq(projectContractAmendments.id, amendmentId))
      .returning()
    return row ?? null
  },
})
