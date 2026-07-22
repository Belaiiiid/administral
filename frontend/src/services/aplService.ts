import type {
  AplApplication,
  AplSimulationInput,
  AplSimulationResult,
  AplTimelineEntry,
} from '@/types';

/**
 * APL service contract.
 *
 * Interfaces only — the implementation belongs to the future full-stack module.
 * Feature components import this type, never the transport, so swapping the
 * placeholder for real calls is invisible to the UI.
 */
export interface AplService {
  listApplications(): Promise<AplApplication[]>;
  getApplication(id: string): Promise<AplApplication>;
  getApplicationTimeline(id: string): Promise<AplTimelineEntry[]>;
  simulate(input: AplSimulationInput): Promise<AplSimulationResult>;
  submitApplication(input: AplSimulationInput): Promise<AplApplication>;
}

const notImplemented = (method: string) => (): never => {
  throw new Error(`aplService.${method}() sera implémenté par le module full-stack APL.`);
};

export const aplService: AplService = {
  listApplications: notImplemented('listApplications'),
  getApplication: notImplemented('getApplication'),
  getApplicationTimeline: notImplemented('getApplicationTimeline'),
  simulate: notImplemented('simulate'),
  submitApplication: notImplemented('submitApplication'),
};
