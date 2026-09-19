import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import type { AppEnv } from '../../../shared/middlewares/auth.middleware'
import { db } from '../../../db/connection'
import {
  ProjectIdParamSchema,
  AmendmentIdParamSchema,
  RequestContractSignatureSchema,
  SignProjectContractSchema,
  UpsertProjectContractSchema,
  CreateAmendmentDraftSchema,
  RequestClientAmendmentSchema,
  SignAmendmentSchema,
} from '../collab.schemas'
import { createProjectRepository } from '../project/project.repository'
import { createMemberRepository } from '../member/member.repository'
import { createContractRepository } from './contract.repository'
import { createContractService } from './contract.service'
import { createContractController } from './contract.controller'

const service = createContractService(
  createContractRepository(db),
  createProjectRepository(db),
  createMemberRepository(db),
)
const controller = createContractController(service)
export const contractRoutes = new Hono<AppEnv>()

contractRoutes.get(
  '/projects/:projectId/contract',
  zValidator('param', ProjectIdParamSchema),
  controller.getContract,
)
contractRoutes.put(
  '/projects/:projectId/contract',
  zValidator('param', ProjectIdParamSchema),
  zValidator('json', UpsertProjectContractSchema),
  controller.saveDraft,
)
contractRoutes.post(
  '/projects/:projectId/contract/request-signature',
  zValidator('param', ProjectIdParamSchema),
  zValidator('json', RequestContractSignatureSchema),
  controller.requestSignature,
)
contractRoutes.post(
  '/projects/:projectId/contract/sign',
  zValidator('param', ProjectIdParamSchema),
  zValidator('json', SignProjectContractSchema),
  controller.sign,
)

// Rutas de Otrosíes y Adiciones Contractuales
contractRoutes.get(
  '/projects/:projectId/contract/amendments',
  zValidator('param', ProjectIdParamSchema),
  controller.listAmendments,
)
contractRoutes.post(
  '/projects/:projectId/contract/amendments',
  zValidator('param', ProjectIdParamSchema),
  zValidator('json', CreateAmendmentDraftSchema),
  controller.saveAmendmentDraft,
)
contractRoutes.post(
  '/projects/:projectId/contract/amendments/request',
  zValidator('param', ProjectIdParamSchema),
  zValidator('json', RequestClientAmendmentSchema),
  controller.requestClientAmendment,
)
contractRoutes.post(
  '/projects/:projectId/contract/amendments/:amendmentId/request-signature',
  zValidator('param', AmendmentIdParamSchema),
  controller.requestAmendmentSignature,
)
contractRoutes.post(
  '/projects/:projectId/contract/amendments/:amendmentId/sign',
  zValidator('param', AmendmentIdParamSchema),
  zValidator('json', SignAmendmentSchema),
  controller.signAmendment,
)
