import { ROUTES } from '@/app/router/paths';

/**
 * CAF's own services — shown on `/portal`, once CAF has been chosen from
 * `/administrations`. Distinct from `AdministrationId` (`services.ts`): that
 * one names a whole administration, this one names one of *this*
 * administration's benefits.
 */
export type CafServiceId = 'apl' | 'af' | 'alf' | 'prime-activite';

export interface CafServiceDefinition {
  id: CafServiceId;
  name: string;
  description: string;
  /** Route this service owns. Empty for a not-yet-available one — nothing to link to. */
  basePath: string;
  status: 'available' | 'coming_soon';
}

export const CAF_SERVICES: CafServiceDefinition[] = [
  {
    id: 'apl',
    name: 'APL à l’Aide',
    description:
      'Gestion simplifiée de vos aides au logement et simulations de droits en temps réel.',
    basePath: ROUTES.dossier,
    status: 'available',
  },
  {
    id: 'af',
    name: 'Allocations Familiales',
    description: 'Suivi de vos allocations familiales et de leurs conditions de versement.',
    basePath: '',
    status: 'coming_soon',
  },
  {
    id: 'alf',
    name: 'ALF',
    description: 'Allocation de logement familiale pour les foyers non éligibles à l’APL.',
    basePath: '',
    status: 'coming_soon',
  },
  {
    id: 'prime-activite',
    name: 'Prime d’activité',
    description: 'Estimation et suivi de votre prime d’activité en fonction de vos revenus.',
    basePath: '',
    status: 'coming_soon',
  },
];

export function getCafService(id: CafServiceId) {
  return CAF_SERVICES.find((service) => service.id === id);
}
