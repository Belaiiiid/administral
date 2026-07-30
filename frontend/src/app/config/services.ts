import type { ServiceDefinition } from '@/types';

/**
 * The service registry — the extension point of the platform.
 *
 * Adding a new administration means: append an entry here, create the matching
 * `features/<id>/` module, and register its routes. Nothing else in the shell
 * needs to change.
 */
export const SERVICES: ServiceDefinition[] = [
  {
    id: 'caf',
    name: 'APL à l’Aide',
    administration: 'CAF',
    description:
      'Gestion simplifiée de vos aides au logement et simulations de droits en temps réel.',
    basePath: '/mon-dossier',
    status: 'available',
    logoUrl: '/caf-logo.svg',
  },
  {
    id: 'france-travail',
    name: 'France Travail',
    administration: 'France Travail',
    description:
      'Analysez une offre d’emploi : compétences requises, pièces à préparer et vos chances d’obtenir le poste.',
    basePath: '/france-travail',
    status: 'available',
    logoUrl: '/france-travail-logo.svg',
  },
  {
    id: 'assurance-maladie',
    name: 'Assurance Maladie',
    administration: 'Ameli',
    description: 'Centralisation de vos remboursements et documents Ameli pour vos dossiers.',
    basePath: '/assurance-maladie',
    status: 'coming_soon',
  },
  {
    id: 'impots',
    name: 'Impôts',
    administration: 'DGFiP',
    description:
      'Visualisation de vos avis d’imposition et aide au calcul du revenu fiscal de référence.',
    basePath: '/impots',
    status: 'coming_soon',
  },
];

export function getService(id: ServiceDefinition['id']) {
  return SERVICES.find((service) => service.id === id);
}
