import { describe, expect, it } from 'vitest'
import type { ProjectContract } from '../collab.types'
import {
  buildAmendmentSnapshot,
  hashAmendmentSnapshot,
} from './amendment-template'

const mockContract: ProjectContract = {
  id: '018f3c1b-5ae0-7d00-8b1c-0d1e2f3a4b5c',
  projectId: '018f3c1b-5ae0-7d00-8b1c-0d1e2f3a4b5d',
  status: 'signed',
  providerKind: 'cima',
  providerName: 'CIMA Centro de Innovación',
  providerTaxId: '900123456-7',
  providerRepresentative: 'Annyul Moreno',
  providerRepresentativeDocument: '1032413946',
  clientKind: 'natural',
  clientName: 'Roberto Gómez',
  clientDocument: '1020304050',
  clientCompanyName: null,
  clientTaxId: null,
  clientRepresentative: null,
  clientRepresentativeDocument: null,
  clientEmail: 'roberto@example.com',
  clientPhone: null,
  planName: 'Plan Oro',
  monthlyFee: 2142000,
  currency: 'COP',
  taxIncluded: true,
  termMonths: 6,
  serviceScope: '20 publicaciones mensuales',
  additionalTerms: null,
  contentSnapshot: 'SNAPSHOT',
  contentHash: 'a1b2c3d4e5f6',
  preparedBySub: '018f3c1b-5ae0-7d00-8b1c-0d1e2f3a4b5e',
  requestedSignatureAt: new Date(),
  signedAt: new Date('2026-09-15T10:00:00Z'),
  signedBySub: '018f3c1b-5ae0-7d00-8b1c-0d1e2f3a4b5f',
  signerName: 'Roberto Gómez',
  signatureDataUrl: 'data:image/png;base64,abc',
  consentAcceptedAt: new Date(),
  signedIpAddress: '127.0.0.1',
  signedUserAgent: 'Mozilla/5.0',
  signatureCity: 'Bogotá, D.C.',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('amendment-template', () => {
  it('genera texto formal de Otrosí referenciando el contrato principal', () => {
    const snapshot = buildAmendmentSnapshot(
      {
        amendmentNumber: 1,
        title: 'Adición de 2 videos publicitarios para Facebook',
        serviceScope: 'Producción y edición de 2 reels de 30 segundos con guion.',
        additionalFee: 500000,
        feePaymentType: 'one_time',
        termMonthsExtension: 0,
        additionalTerms: 'Se entregan antes del 30 de octubre.',
        signatureCity: 'Bogotá, D.C.',
      },
      mockContract,
      'Campaña Primavera 2026',
    )

    expect(snapshot).toContain('OTROSÍ N° 01 AL CONTRATO DE PRESTACIÓN DE SERVICIOS')
    expect(snapshot).toContain('Campaña Primavera 2026')
    expect(snapshot).toContain('Adición de 2 videos publicitarios para Facebook')
    expect(snapshot).toContain('$ 500.000')
    expect(snapshot).toContain('CLÁUSULA CUARTA. INALTERABILIDAD Y RATIFICACIÓN')
  })

  it('calcula hash SHA-256 inmutable para el Otrosí', () => {
    const snapshot = buildAmendmentSnapshot(
      {
        amendmentNumber: 2,
        title: 'Prórroga de campaña',
        serviceScope: 'Extensión de gestión de redes por 2 meses adicionales.',
        additionalFee: 2142000,
        feePaymentType: 'monthly_recurring',
        termMonthsExtension: 2,
        additionalTerms: null,
        signatureCity: 'Bogotá, D.C.',
      },
      mockContract,
      'Campaña Primavera 2026',
    )

    const hash = hashAmendmentSnapshot(snapshot)
    expect(hash).toHaveLength(64)
    expect(hash).toBe(hashAmendmentSnapshot(snapshot))
  })
})
