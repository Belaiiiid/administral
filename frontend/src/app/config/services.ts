import { ROUTES } from '@/app/router/paths';
import type { ServiceDefinition } from '@/types';

/**
 * The administrations registry — shown on `/administrations`, the first
 * choice a citizen makes.
 *
 * Adding a new administration means: append an entry here, create the matching
 * `features/<id>/` module, and register its routes. Nothing else in the shell
 * needs to change.
 */
export const SERVICES: ServiceDefinition[] = [
  {
    id: 'caf',
    name: 'CAF',
    fullName: 'Caisse d’Allocations Familiales',
    administration: 'CAF',
    description:
      'L’organisme qui verse les aides au logement, familiales et de solidarité. Ici : simulez vos droits et suivez vos aides au logement.',
    // The only administration wired up today — opens its own services hub
    // (`/portal`) rather than a service directly, since CAF itself offers
    // several (APL, AF, ALF, Prime d'activité).
    basePath: ROUTES.portal,
    status: 'available',
    logoUrl: '/caf-logo.svg',
    photoUrl: '/caf.jpg',
  },
  {
    id: 'france-travail',
    name: 'France Travail',
    fullName: 'Service public de l’emploi (ex-Pôle emploi)',
    administration: 'France Travail',
    description:
      'L’organisme qui accompagne la recherche d’emploi et l’indemnisation. Ici : analysez une offre — compétences requises et pièces à préparer.',
    basePath: '/france-travail',
    status: 'available',
    logoUrl: '/france-travail-logo.svg',
    photoUrl: '/franceTravail.jpg',
  },
  {
    id: 'assurance-maladie',
    name: 'Assurance Maladie',
    fullName: 'CPAM — Caisse Primaire d’Assurance Maladie, en ligne sur Ameli',
    administration: 'Ameli',
    description:
      'L’organisme qui rembourse vos frais de santé et gère votre carte Vitale. Ici : retrouvez vos remboursements et attestations pour vos dossiers.',
    basePath: '/assurance-maladie',
    status: 'coming_soon',
    logoUrl: '/assurance-maladie-logo.svg',
    photoUrl: '/assuranceMaladie.jpg',
  },
  {
    id: 'impots',
    name: 'Impôts',
    fullName: 'DGFiP — Direction Générale des Finances Publiques',
    administration: 'DGFiP',
    description:
      'L’administration qui gère votre déclaration de revenus et le calcul de vos impôts. Ici : consultez vos avis d’imposition et votre revenu fiscal de référence (RFR).',
    basePath: '/impots',
    status: 'coming_soon',
    logoUrl: '/impots.jpg',
    photoUrl: '/impots.jpg',
  },
];

export function getService(id: ServiceDefinition['id']) {
  return SERVICES.find((service) => service.id === id);
}
