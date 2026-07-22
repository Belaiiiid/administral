import type { Case } from '@/types';

/**
 * ⚠️ SYNTHETIC DATA — NOT REAL ALLOCATAIRES ⚠️
 *
 * Every identity below is invented for development and review. Surnames carry
 * a `-Test` suffix, e-mail addresses use the reserved `.test` TLD (RFC 6761),
 * and NIR values are masked placeholders that match no real person. Nothing
 * here may be presented as production data.
 *
 * This file is the *only* place in the Agent Portal where case data is written
 * by hand. It is reachable exclusively through `mockAgentCaseService`; deleting
 * this file and that adapter returns the portal to the "fabricate nothing"
 * stance the rest of the codebase holds (see `store/sessionStore.ts`).
 *
 * Shapes conform to the backend contract in `src/types/case.ts`, so a real
 * `GET /agent/cases/{id}` response can replace them field for field.
 */
export const CASE_FIXTURES: Case[] = [
  {
    id: 'case-2026-0417',
    applicationNumber: '2026-APL-0417',
    citizen: {
      id: 'citizen-fixture-1',
      firstName: 'Camille',
      lastName: 'Dupont-Test',
      email: 'camille.dupont@example.test',
      birthDate: '1991-04-12',
      maskedSocialSecurityNumber: '2 91 04 •• ••• ••• ••',
    },
    submittedAt: '2026-07-14T09:24:00.000Z',
    service: { id: 'caf', label: 'Aide personnalisée au logement' },
    status: 'ready_for_decision',
    score: {
      value: 87,
      band: 'high',
      computedAt: '2026-07-14T09:31:00.000Z',
      model: 'eligibility-scoring-v2.1',
    },
    profile: {
      household: { maritalStatus: 'single', dependentChildren: 0, attachedAdults: 0 },
      housing: {
        occupancyStatus: 'tenant',
        livingAreaSqm: 32,
        monthlyRentExcludingCharges: 620,
        address: '14 rue des Lilas',
        postalCode: '69003',
        city: 'Lyon',
      },
      annualIncome: 21400,
      capturedAt: '2026-07-14T09:24:00.000Z',
    },
    documents: [
      {
        id: 'doc-0417-1',
        requirementId: 'lease',
        requirementLabel: 'Contrat de location',
        fileName: 'bail-location.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 482_311,
        uploadedAt: '2026-07-14T09:20:00.000Z',
        status: 'validated',
        extractedAt: '2026-07-14T09:26:00.000Z',
      },
      {
        id: 'doc-0417-2',
        requirementId: 'income_tax_notice',
        requirementLabel: 'Avis d’imposition',
        fileName: 'avis-imposition-2025.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 311_902,
        uploadedAt: '2026-07-14T09:21:00.000Z',
        status: 'validated',
        extractedAt: '2026-07-14T09:27:00.000Z',
      },
      {
        id: 'doc-0417-3',
        requirementId: 'id_card',
        requirementLabel: 'Pièce d’identité',
        fileName: 'carte-identite.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1_204_558,
        uploadedAt: '2026-07-14T09:22:00.000Z',
        status: 'validated',
        extractedAt: '2026-07-14T09:28:00.000Z',
      },
    ],
    completenessReport: {
      outcome: 'passed',
      checkedAt: '2026-07-14T09:29:00.000Z',
      completionRate: 100,
      items: [
        { id: 'lease', label: 'Contrat de location', received: true, required: true },
        { id: 'income_tax_notice', label: 'Avis d’imposition', received: true, required: true },
        { id: 'id_card', label: 'Pièce d’identité', received: true, required: true },
        { id: 'rib', label: 'Relevé d’identité bancaire', received: true, required: true },
      ],
    },
    coherenceReport: {
      outcome: 'passed',
      checkedAt: '2026-07-14T09:30:00.000Z',
      anomalies: [],
    },
  },

  {
    id: 'case-2026-0392',
    applicationNumber: '2026-APL-0392',
    citizen: {
      id: 'citizen-fixture-2',
      firstName: 'Mehdi',
      lastName: 'Baraka-Test',
      email: 'mehdi.baraka@example.test',
      birthDate: '1984-11-30',
      maskedSocialSecurityNumber: '1 84 11 •• ••• ••• ••',
    },
    submittedAt: '2026-07-17T14:05:00.000Z',
    service: { id: 'caf', label: 'Aide personnalisée au logement' },
    status: 'under_review',
    score: {
      value: 54,
      band: 'medium',
      computedAt: '2026-07-17T14:12:00.000Z',
      model: 'eligibility-scoring-v2.1',
    },
    profile: {
      household: { maritalStatus: 'married', dependentChildren: 2, attachedAdults: 0 },
      housing: {
        occupancyStatus: 'tenant',
        livingAreaSqm: 74,
        monthlyRentExcludingCharges: 1_040,
        address: '8 avenue Jean Jaurès',
        postalCode: '93100',
        city: 'Montreuil',
      },
      annualIncome: 38_900,
      capturedAt: '2026-07-17T14:05:00.000Z',
    },
    documents: [
      {
        id: 'doc-0392-1',
        requirementId: 'lease',
        requirementLabel: 'Contrat de location',
        fileName: 'bail-montreuil.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 556_120,
        uploadedAt: '2026-07-17T14:00:00.000Z',
        status: 'validated',
        extractedAt: '2026-07-17T14:08:00.000Z',
      },
      {
        id: 'doc-0392-2',
        requirementId: 'income_tax_notice',
        requirementLabel: 'Avis d’imposition',
        fileName: 'avis-imposition-2025.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 298_440,
        uploadedAt: '2026-07-17T14:02:00.000Z',
        status: 'validated',
        extractedAt: '2026-07-17T14:09:00.000Z',
      },
    ],
    completenessReport: {
      outcome: 'warning',
      checkedAt: '2026-07-17T14:10:00.000Z',
      completionRate: 75,
      items: [
        { id: 'lease', label: 'Contrat de location', received: true, required: true },
        { id: 'income_tax_notice', label: 'Avis d’imposition', received: true, required: true },
        { id: 'id_card', label: 'Pièce d’identité', received: false, required: true },
        { id: 'rib', label: 'Relevé d’identité bancaire', received: true, required: true },
      ],
    },
    coherenceReport: {
      outcome: 'warning',
      checkedAt: '2026-07-17T14:11:00.000Z',
      anomalies: [
        {
          id: 'anomaly-0392-1',
          severity: 'warning',
          field: 'Loyer mensuel hors charges',
          declaredValue: '1 040 €',
          observedValue: '1 120 €',
          message:
            'Le loyer déclaré diffère du montant lu sur le contrat de location. Écart de 80 €.',
        },
      ],
    },
  },

  {
    id: 'case-2026-0355',
    applicationNumber: '2026-APL-0355',
    citizen: {
      id: 'citizen-fixture-3',
      firstName: 'Léa',
      lastName: 'Nguyen-Test',
      email: 'lea.nguyen@example.test',
      birthDate: '1999-02-08',
      maskedSocialSecurityNumber: '2 99 02 •• ••• ••• ••',
    },
    submittedAt: '2026-07-20T11:47:00.000Z',
    service: { id: 'caf', label: 'Aide personnalisée au logement' },
    status: 'awaiting_documents',
    score: {
      value: 28,
      band: 'low',
      computedAt: '2026-07-20T11:52:00.000Z',
      model: 'eligibility-scoring-v2.1',
    },
    profile: {
      household: { maritalStatus: 'cohabiting', dependentChildren: 0, attachedAdults: 1 },
      housing: {
        occupancyStatus: 'hosted',
        livingAreaSqm: 18,
        monthlyRentExcludingCharges: 0,
        address: '3 impasse du Moulin',
        postalCode: '31000',
        city: 'Toulouse',
      },
      annualIncome: 9_600,
      capturedAt: '2026-07-20T11:47:00.000Z',
    },
    documents: [
      {
        id: 'doc-0355-1',
        requirementId: 'id_card',
        requirementLabel: 'Pièce d’identité',
        fileName: 'cni-recto-verso.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 402_009,
        uploadedAt: '2026-07-20T11:44:00.000Z',
        status: 'validated',
        extractedAt: '2026-07-20T11:49:00.000Z',
      },
      {
        id: 'doc-0355-2',
        requirementId: 'proof_of_address',
        requirementLabel: 'Attestation d’hébergement',
        fileName: 'attestation-hebergement.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2_310_774,
        uploadedAt: '2026-07-20T11:46:00.000Z',
        status: 'rejected',
        errorMessage: 'Document illisible : la photo est floue et partiellement coupée.',
      },
    ],
    completenessReport: {
      outcome: 'failed',
      checkedAt: '2026-07-20T11:50:00.000Z',
      completionRate: 40,
      items: [
        { id: 'id_card', label: 'Pièce d’identité', received: true, required: true },
        { id: 'proof_of_address', label: 'Attestation d’hébergement', received: false, required: true },
        { id: 'income_tax_notice', label: 'Avis d’imposition', received: false, required: true },
        { id: 'rib', label: 'Relevé d’identité bancaire', received: true, required: true },
        { id: 'host_id', label: 'Pièce d’identité de l’hébergeant', received: false, required: true },
      ],
    },
    coherenceReport: {
      outcome: 'failed',
      checkedAt: '2026-07-20T11:51:00.000Z',
      anomalies: [
        {
          id: 'anomaly-0355-1',
          severity: 'error',
          field: 'Adresse de résidence',
          declaredValue: '3 impasse du Moulin, 31000 Toulouse',
          observedValue: 'Document illisible',
          message:
            'L’adresse déclarée n’a pas pu être confirmée : l’attestation d’hébergement est inexploitable.',
        },
        {
          id: 'anomaly-0355-2',
          severity: 'warning',
          field: 'Revenu annuel',
          declaredValue: '9 600 €',
          observedValue: 'Non vérifié',
          message: 'Aucun avis d’imposition fourni : le revenu déclaré reste non corroboré.',
        },
      ],
    },
  },
];
