import type { AdministrationId, CitizenNotification, ServiceDefinition } from '@/types';

export interface PortalService {
  listAvailableServices(): Promise<ServiceDefinition[]>;
  activateService(id: AdministrationId): Promise<void>;
  deactivateService(id: AdministrationId): Promise<void>;
  listNotifications(): Promise<CitizenNotification[]>;
  markAllNotificationsRead(): Promise<void>;
}

const notImplemented = (method: string) => (): never => {
  throw new Error(`portalService.${method}() sera implémenté par le module full-stack Portail.`);
};

export const portalService: PortalService = {
  listAvailableServices: notImplemented('listAvailableServices'),
  activateService: notImplemented('activateService'),
  deactivateService: notImplemented('deactivateService'),
  listNotifications: notImplemented('listNotifications'),
  markAllNotificationsRead: notImplemented('markAllNotificationsRead'),
};
