/**
 * Citizen · Profiling — public API.
 *
 * The adaptive APL profiling assistant (A2/A3/A4). Pages are code-split by the
 * router and imported directly from `./pages/*`; everything else a sibling may
 * need is re-exported here so the feature's internals stay private.
 */
export { useProfilageStore } from '@/features/citizen/profiling/store/profilageStore';
export type { HistoriqueEntry } from '@/features/citizen/profiling/store/profilageStore';
export { profilageService } from '@/features/citizen/profiling/services/profilageService';
export type { ProfilageService } from '@/features/citizen/profiling/services/profilageService';
export {
  ACCESSIBILITY_OPTIONS,
  type AccessibilityOption,
} from '@/features/citizen/profiling/utils/accessibilityOptions';
export * from '@/features/citizen/profiling/types/profilage';
