/**
 * Cross-cutting types shared by every feature module.
 * Business-specific shapes live in their own file (apl.ts, profile.ts, …).
 */

/** Canonical status vocabulary rendered by <StatusBadge />. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'accent';

export type ProcessStatus = 'draft' | 'pending' | 'in_progress' | 'validated' | 'rejected';

/**
 * A French public administration exposed as a service module in the portal.
 *
 * Only `caf` and `france-travail` are wired to a real backend today; the rest
 * are listed on `/administrations` as `coming_soon` so a citizen can see the
 * intended scope. Adding an id here means adding an icon to
 * `ADMINISTRATION_ICONS` (components/citizen/ServiceCard) — the record is
 * exhaustive, so TypeScript will point at it.
 */
export type AdministrationId =
  | 'caf'
  | 'france-travail'
  | 'assurance-maladie'
  | 'impots'
  | 'retraite'
  | 'ants'
  | 'urssaf'
  | 'msa'
  | 'crous'
  | 'anah'
  | 'mdph'
  | 'service-public';

export interface ServiceDefinition {
  id: AdministrationId;
  /** Public-facing service name, e.g. « APL à l'Aide ». */
  name: string;
  /**
   * What the abbreviated `name` stands for, e.g. « Caisse d'Allocations
   * Familiales » for CAF. Shown under the name so a citizen who does not
   * already know the administration can tell what it is.
   */
  fullName?: string;
  administration: string;
  description: string;
  /** Route prefix owned by this service module, e.g. `/apl`. */
  basePath: string;
  status: 'available' | 'coming_soon';
  /** Real administration logo (`public/`) shown on the tile instead of the
   *  generic icon, when the administration's own mark should be recognisable
   *  rather than genericised. Optional — most services fall back to the icon. */
  logoUrl?: string;
  /** Photo (`public/`) filling the service card's image panel on the landing
   *  page. Optional — falls back to a tinted panel with the icon. */
  photoUrl?: string;
}

/** Envelope returned by every service-layer call. */
export interface Result<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}
