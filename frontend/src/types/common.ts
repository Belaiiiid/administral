/**
 * Cross-cutting types shared by every feature module.
 * Business-specific shapes live in their own file (apl.ts, profile.ts, …).
 */

/** Canonical status vocabulary rendered by <StatusBadge />. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'accent';

export type ProcessStatus = 'draft' | 'pending' | 'in_progress' | 'validated' | 'rejected';

/** A French public administration exposed as a service module in the portal. */
export type AdministrationId = 'caf' | 'france-travail' | 'assurance-maladie' | 'impots';

export interface ServiceDefinition {
  id: AdministrationId;
  /** Public-facing service name, e.g. « APL à l'Aide ». */
  name: string;
  administration: string;
  description: string;
  /** Route prefix owned by this service module, e.g. `/apl`. */
  basePath: string;
  status: 'available' | 'coming_soon';
  /** Real administration logo (`public/`) shown on the tile instead of the
   *  generic icon, when the administration's own mark should be recognisable
   *  rather than genericised. Optional — most services fall back to the icon. */
  logoUrl?: string;
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
