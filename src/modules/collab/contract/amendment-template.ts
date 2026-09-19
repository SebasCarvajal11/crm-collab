import { createHash } from 'node:crypto'
import type { ProjectContract } from '../collab.types'

export type ProjectContractAmendmentEntity = {
  id: string
  contractId: string
  projectId: string
  amendmentNumber: number
  title: string
  amendmentType: 'services' | 'economic' | 'extension' | 'mixed'
  status: 'draft' | 'pending_signature' | 'signed'
  serviceScope: string
  additionalFee: number
  feePaymentType: 'one_time' | 'monthly_recurring'
  termMonthsExtension: number
  additionalTerms?: string | null
  clientRequestNotes?: string | null
  contentSnapshot?: string | null
  contentHash?: string | null
  preparedBySub: string
  requestedSignatureAt?: Date | null
  signedAt?: Date | null
  signedBySub?: string | null
  signerName?: string | null
  signatureDataUrl?: string | null
  consentAcceptedAt?: Date | null
  signedIpAddress?: string | null
  signedUserAgent?: string | null
  signatureCity: string
  createdAt: Date
  updatedAt: Date
}

const formatMoney = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)

export function buildAmendmentSnapshot(
  amendment: Pick<
    ProjectContractAmendmentEntity,
    | 'amendmentNumber'
    | 'title'
    | 'serviceScope'
    | 'additionalFee'
    | 'feePaymentType'
    | 'termMonthsExtension'
    | 'additionalTerms'
    | 'signatureCity'
  >,
  contract: ProjectContract,
  projectName: string,
): string {
  const num = amendment.amendmentNumber.toString().padStart(2, '0')
  const clientIdentity =
    contract.clientKind === 'juridical'
      ? `${contract.clientCompanyName}, NIT ${contract.clientTaxId}, rep. por ${contract.clientRepresentative}`
      : `${contract.clientName}, documento ${contract.clientDocument}`

  const signedDateStr = contract.signedAt
    ? new Date(contract.signedAt).toLocaleDateString('es-CO')
    : 'fecha anterior'

  const feeDesc =
    amendment.additionalFee > 0
      ? amendment.feePaymentType === 'monthly_recurring'
        ? `un incremento mensual recurrente de ${formatMoney(amendment.additionalFee)}`
        : `un valor total adicional y único de ${formatMoney(amendment.additionalFee)}`
      : 'no genera contraprestación económica adicional'

  const termDesc =
    amendment.termMonthsExtension > 0
      ? `Se prorroga la vigencia del contrato en ${amendment.termMonthsExtension} mes(es) adicionales.`
      : 'Se mantiene la vigencia original estipulada en el Contrato Principal.'

  return [
    `OTROSÍ N° ${num} AL CONTRATO DE PRESTACIÓN DE SERVICIOS`,
    `Proyecto: ${projectName}`,
    `Vinculado al Contrato Principal (SHA-256: ${contract.contentHash ?? contract.id.slice(0, 8)})`,
    '',
    `Entre ${contract.providerName}, en adelante EL PRESTADOR, y ${clientIdentity}, en adelante EL CLIENTE, ` +
      `se conviene suscribir el presente OTROSÍ N° ${num} modificatorio y adicional al Contrato Principal ` +
      `suscrito el ${signedDateStr}.`,
    '',
    'CLÁUSULA PRIMERA. OBJETO DE LA ADICIÓN.',
    `Las partes acuerdan incorporar al proyecto "${projectName}" los siguientes entregables y servicios:`,
    `${amendment.title}. ${amendment.serviceScope}`,
    '',
    'CLÁUSULA SEGUNDA. CONDICIONES ECONÓMICAS.',
    `Por concepto de los servicios adicionados en este Otrosí, EL CLIENTE pagará ${feeDesc}. ` +
      'Las condiciones de facturación y plazos siguen los términos del acuerdo base.',
    '',
    'CLÁUSULA TERCERA. PLAZO Y VIGENCIA.',
    termDesc,
    '',
    'CLÁUSULA CUARTA. INALTERABILIDAD Y RATIFICACIÓN.',
    'Las partes ratifican expresamente que todas las demás cláusulas, obligaciones y condiciones del Contrato ' +
      'Principal que no hayan sido modificadas por este Otrosí permanecen vigentes e inalteradas en su totalidad.',
    amendment.additionalTerms?.trim() ? `\nCondiciones particulares\n${amendment.additionalTerms.trim()}` : '',
    '',
    `En aceptación y conformidad, las partes suscriben electrónicamente este documento en ${amendment.signatureCity}.`,
    'Al firmar electrónicamente, EL CLIENTE declara haber leído, comprendido y aceptado el presente Otrosí.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function hashAmendmentSnapshot(snapshot: string): string {
  return createHash('sha256').update(snapshot, 'utf8').digest('hex')
}
