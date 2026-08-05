import { ROUTES } from '@/app/router/paths';
import type { ServiceDefinition } from '@/types';

/**
 * The administrations registry — shown on `/administrations`, the first
 * choice a citizen makes.
 *
 * Adding a new administration means: append an entry here, create the matching
 * `features/<id>/` module, and register its routes. Nothing else in the shell
 * needs to change.
 *
 * Order is the display order. CAF and France Travail lead because they are the
 * two that actually work; everything after them is `coming_soon` and renders as
 * a locked tile rather than pretending to be usable.
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
  {
    id: 'retraite',
    name: 'Assurance retraite',
    fullName: 'Cnav et Carsat — régime général de la retraite',
    administration: 'Assurance retraite',
    description:
      'L’organisme qui calcule et verse la retraite du régime général. Relevé de carrière, âge de départ et demande de retraite personnelle.',
    basePath: '/retraite',
    status: 'coming_soon',
    logoUrl: 'https://ville-parmain.fr/sites/parmain/files/styles/galerie_colorbox/public/image/cnav-la-caisse-nationale-dassurance-vieillesse.jpg?itok=hm9wUeHL',
  },
  {
    id: 'ants',
    // Renamed from ANTS in 2024; the acronym survives in the service's own
    // domain (ants.gouv.fr), so it stays in `fullName` for recognition.
    name: 'France Titres',
    fullName: 'ANTS — Agence Nationale des Titres Sécurisés',
    administration: 'France Titres',
    description:
      'L’agence qui délivre vos titres officiels, en ligne sur ants.gouv.fr : passeport, carte nationale d’identité, permis de conduire et carte grise.',
    basePath: '/ants',
    status: 'coming_soon',
    logoUrl: '/administrations/logo-ants.svg',
  },
  {
    id: 'urssaf',
    name: 'Urssaf',
    fullName: 'Recouvrement des cotisations sociales',
    administration: 'Urssaf',
    description:
      'L’organisme qui collecte les cotisations sociales. Auto-entrepreneurs, Cesu et Pajemploi : déclarations et attestations.',
    basePath: '/urssaf',
    status: 'coming_soon',
    logoUrl: '/administrations/logo-urssaf.svg',
  },
  {
    id: 'mdph',
    name: 'MDPH',
    fullName: 'Maison Départementale des Personnes Handicapées',
    administration: 'MDPH',
    description:
      'Le guichet départemental du handicap. AAH, prestation de compensation, carte mobilité inclusion et reconnaissance RQTH.',
    basePath: '/mdph',
    status: 'coming_soon',
    logoUrl: 'https://www.bagneux92.fr/Files/a/c/csm_mdph_199640c76a.jpg',
  },
  {
    id: 'crous',
    name: 'Crous',
    fullName: 'Centre régional des œuvres universitaires et scolaires',
    administration: 'Crous',
    description:
      'L’organisme de la vie étudiante. Dossier social étudiant, bourse sur critères sociaux et logement universitaire.',
    basePath: '/crous',
    status: 'coming_soon',
    logoUrl: '/administrations/logo-crous.svg',
  },
  {
    id: 'anah',
    name: 'Anah',
    fullName: 'Agence nationale de l’habitat — MaPrimeRénov’',
    administration: 'Anah',
    description:
      'L’agence qui finance les travaux dans le logement. Rénovation énergétique, adaptation au vieillissement et habitat dégradé.',
    basePath: '/anah',
    status: 'coming_soon',
    logoUrl: '/administrations/logo-anah.svg',
  },
  {
    id: 'msa',
    name: 'MSA',
    fullName: 'Mutualité Sociale Agricole',
    administration: 'MSA',
    description:
      'Le régime de protection sociale du monde agricole : santé, famille et retraite pour les exploitants et les salariés agricoles.',
    basePath: '/msa',
    status: 'coming_soon',
    logoUrl: '/administrations/logo-msa.svg',
  },
  {
    id: 'service-public',
    name: 'Service-Public.fr',
    fullName: 'Le site officiel de l’administration française',
    administration: 'DILA',
    description:
      'Le portail de référence de vos démarches : fiches pratiques, formulaires officiels et annuaire des services publics.',
    basePath: '/service-public',
    status: 'coming_soon',
    logoUrl: '/administrations/logo-service-public.svg',
  },
];

export function getService(id: ServiceDefinition['id']) {
  return SERVICES.find((service) => service.id === id);
}
