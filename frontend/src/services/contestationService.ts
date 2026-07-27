import type { Contestation, ContestationReason } from '@/types';
import { apiClient } from './apiClient';

/**
 * Citizen-side contestation contract — the droit de contestation.
 *
 * The citizen opens a challenge on their own decided dossier and tracks it. The
 * dossier is named by its `applicationNumber`; ownership is enforced server-side
 * from the token, so no call here names whose contestation it is. Agent-side
 * review/resolve lives in `features/agent/services`, not on this citizen surface.
 */
export interface ContestationService {
  /** File a challenge. `POST /contestations`. */
  create(input: {
    applicationNumber: string;
    reason: ContestationReason;
    description: string;
  }): Promise<Contestation>;
  /** The citizen's own challenges, newest first. `GET /contestations/my`. */
  listMine(): Promise<Contestation[]>;
}

export const contestationService: ContestationService = {
  create: ({ applicationNumber, reason, description }) =>
    apiClient.post<Contestation>('/contestations', {
      applicationNumber,
      reason,
      description,
    }),

  listMine: () => apiClient.get<Contestation[]>('/contestations/my'),
};
