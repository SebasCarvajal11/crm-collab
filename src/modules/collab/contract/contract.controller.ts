import type { Context } from 'hono'
import type { AppEnv } from '../../../shared/middlewares/auth.middleware'
import { actorFromContext } from '../actor'
import { validatedJson } from '../validated-json'
import type {
  SignProjectContractBody,
  UpsertProjectContractBody,
  CreateAmendmentDraftBody,
  RequestClientAmendmentBody,
  SignAmendmentBody,
} from '../collab.schemas'
import type { createContractService } from './contract.service'

const requestMeta = (c: Context) => ({
  ipAddress:
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip')?.trim() ??
    'unknown',
  userAgent: c.req.header('user-agent') ?? 'unknown',
})

const projectId = (c: Context) => c.req.param('projectId') ?? ''
const amendmentId = (c: Context) => c.req.param('amendmentId') ?? ''

export const createContractController = (service: ReturnType<typeof createContractService>) => ({
  getContract: async (c: Context<AppEnv>) =>
    c.json({ data: await service.getContract(actorFromContext(c), projectId(c)) }, 200),

  saveDraft: async (c: Context<AppEnv>) =>
    c.json(
      {
        data: await service.saveDraft(
          actorFromContext(c),
          projectId(c),
          validatedJson<UpsertProjectContractBody>(c),
          requestMeta(c),
        ),
      },
      200,
    ),

  requestSignature: async (c: Context<AppEnv>) =>
    c.json(
      {
        data: await service.requestSignature(actorFromContext(c), projectId(c), requestMeta(c)),
      },
      200,
    ),

  sign: async (c: Context<AppEnv>) =>
    c.json(
      {
        data: await service.sign(
          actorFromContext(c),
          projectId(c),
          validatedJson<SignProjectContractBody>(c),
          requestMeta(c),
        ),
      },
      200,
    ),

  listAmendments: async (c: Context<AppEnv>) =>
    c.json({ data: await service.listAmendments(actorFromContext(c), projectId(c)) }, 200),

  saveAmendmentDraft: async (c: Context<AppEnv>) =>
    c.json(
      {
        data: await service.saveAmendmentDraft(
          actorFromContext(c),
          projectId(c),
          validatedJson<CreateAmendmentDraftBody>(c),
          requestMeta(c),
        ),
      },
      200,
    ),

  requestClientAmendment: async (c: Context<AppEnv>) =>
    c.json(
      {
        data: await service.requestClientAmendment(
          actorFromContext(c),
          projectId(c),
          validatedJson<RequestClientAmendmentBody>(c),
          requestMeta(c),
        ),
      },
      200,
    ),

  requestAmendmentSignature: async (c: Context<AppEnv>) =>
    c.json(
      {
        data: await service.requestAmendmentSignature(
          actorFromContext(c),
          projectId(c),
          amendmentId(c),
          requestMeta(c),
        ),
      },
      200,
    ),

  signAmendment: async (c: Context<AppEnv>) =>
    c.json(
      {
        data: await service.signAmendment(
          actorFromContext(c),
          projectId(c),
          amendmentId(c),
          validatedJson<SignAmendmentBody>(c),
          requestMeta(c),
        ),
      },
      200,
    ),
})
