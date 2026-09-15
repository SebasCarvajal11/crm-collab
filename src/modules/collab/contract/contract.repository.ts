import { eq } from "drizzle-orm";
import { projectContracts } from "../../../db/schema";
import type { DbOrTx } from "../shared/db.types";
import type { NewProjectContract } from "../collab.types";

export const createContractRepository = (conn: DbOrTx) => ({
  getByProjectId: async (projectId: string) => {
    const [row] = await conn.select().from(projectContracts).where(eq(projectContracts.projectId, projectId)).limit(1);
    return row ?? null;
  },

  upsertDraft: async (payload: NewProjectContract) => {
    const [row] = await conn
      .insert(projectContracts)
      .values(payload)
      .onConflictDoUpdate({
        target: [projectContracts.projectId],
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  requestSignature: async (projectId: string, contentSnapshot: string, contentHash: string) => {
    const [row] = await conn
      .update(projectContracts)
      .set({ status: "pending_signature", contentSnapshot, contentHash, requestedSignatureAt: new Date(), updatedAt: new Date() })
      .where(eq(projectContracts.projectId, projectId))
      .returning();
    return row ?? null;
  },

  sign: async (projectId: string, payload: Pick<NewProjectContract, "signedBySub" | "signerName" | "signatureDataUrl" | "signedIpAddress" | "signedUserAgent">) => {
    const now = new Date();
    const [row] = await conn
      .update(projectContracts)
      .set({
        status: "signed",
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
      .returning();
    return row ?? null;
  },
});
