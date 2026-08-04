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
  /**
   * What the abbreviated `name` stands for, e.g. « Aide Personnalisée au
   * Logement » for APL — most citizens meet these benefits as acronyms only.
   */
  fullName?: string;
  description: string;
  /** Route this service owns. Empty for a not-yet-available one — nothing to link to. */
  basePath: string;
  status: 'available' | 'coming_soon';
  /** Artwork filling the card's panel on `/portal` (`public/caf-services/`). */
  photoUrl?: string;
}

export const CAF_SERVICES: CafServiceDefinition[] = [
  {
    id: 'apl',
    name: 'APL à l’Aide',
    fullName: 'APL — Aide Personnalisée au Logement',
    description:
      'Aide au paiement du loyer, versée sous conditions de ressources pour un logement conventionné. Ici : simulez vos droits et déposez votre dossier.',
    basePath: ROUTES.dossier,
    status: 'available',
    photoUrl: '/caf-services/apl.svg',
  },
  {
    id: 'af',
    name: 'Allocations Familiales',
    fullName: 'AF — Allocations Familiales',
    description:
      'Versement mensuel aux familles ayant au moins deux enfants à charge, sans condition d’activité.',
    basePath: '',
    status: 'coming_soon',
    photoUrl: '/caf-services/af.svg',
  },
  {
    id: 'alf',
    name: 'ALF',
    fullName: 'ALF — Allocation de Logement Familiale',
    description:
      'Aide au logement pour les foyers avec personnes à charge qui ne peuvent pas prétendre à l’APL.',
    basePath: '',
    status: 'coming_soon',
    photoUrl: '/caf-services/alf.svg',
  },
  {
    id: 'prime-activite',
    name: 'Prime d’activité',
    fullName: 'Complément de revenu pour les actifs modestes',
    description:
      'Complète les revenus des personnes qui travaillent tout en gagnant peu. Ici : estimez et suivez votre montant.',
    basePath: '',
    status: 'coming_soon',
    photoUrl: '/caf-services/prime-activite.svg',
  },
];

export function getCafService(id: CafServiceId) {
  return CAF_SERVICES.find((service) => service.id === id);
}
