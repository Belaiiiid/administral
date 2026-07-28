import {
  AlertTriangle,
  FileCheck2,
  Gavel,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import type { AuditAction, AuditEvent } from '@/features/agent/services';
import { useCaseAuditTrail } from '@/features/agent/hooks';

/**
 * The dossier's immutable audit trail — the "Traçabilité totale" guardrail made
 * visible to the instructing agent.
 *
 * A pure projection of `GET /api/audit/case/{applicationNumber}`: it renders the
 * events as received and reports whether the hash chain still verifies. It never
 * writes — the trail has no client write path — so an agent can consult the
 * history behind a decision (or answer a contestation) but not alter it.
 */

const ACTION_LABEL: Record<AuditAction, string> = {
  dossier_submitted: 'Dossier soumis',
  decision_recorded: 'Décision enregistrée',
  profile_updated: 'Profil mis à jour',
  contestation_created: 'Contestation déposée',
  contestation_review_started: 'Contestation prise en examen',
  contestation_resolved: 'Contestation résolue',
};

const ACTION_ICON: Record<AuditAction, ComponentType<{ className?: string }>> = {
  dossier_submitted: FileCheck2,
  decision_recorded: Gavel,
  profile_updated: UserCog,
  contestation_created: AlertTriangle,
  contestation_review_started: ScrollText,
  contestation_resolved: Gavel,
};

function AuditRow({ event }: { event: AuditEvent }) {
  const Icon = ACTION_ICON[event.action] ?? FileCheck2;
  const label = ACTION_LABEL[event.action] ?? event.action;

  return (
    <li className="flex gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-label-md text-on-surface">{label}</p>
          <time className="text-body-sm text-on-surface-variant" dateTime={event.occurredAt}>
            {formatDate(event.occurredAt)}
          </time>
        </div>
        <p className="text-body-sm text-on-surface-variant">{event.summary}</p>
        <p className="mt-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
          {event.actorRole}
          {/* A short hash fingerprint, enough to eyeball two records match. */}
          <span className="ml-2 font-mono lowercase tracking-normal opacity-70">
            #{event.eventHash.slice(0, 10)}
          </span>
        </p>
      </div>
    </li>
  );
}

export interface CaseAuditCardProps {
  /** The dossier reference — its `entity_id` in the trail. */
  applicationNumber: string;
}

export function CaseAuditCard({ applicationNumber }: CaseAuditCardProps) {
  const resource = useCaseAuditTrail(applicationNumber);
  const trail = resource.data;

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Journal d’audit"
          as="h2"
          action={
            trail &&
            (trail.chainIntact ? (
              <Badge tone="success">
                <ShieldCheck aria-hidden="true" />
                Chaîne vérifiée
              </Badge>
            ) : (
              <Badge tone="error">
                <ShieldAlert aria-hidden="true" />
                Intégrité compromise
              </Badge>
            ))
          }
        />
      </CardHeader>
      <CardContent>
        {resource.isLoading && <Skeleton className="h-24 w-full" />}

        {resource.error && (
          <p className="text-body-sm text-on-surface-variant">
            Le journal d’audit n’a pas pu être chargé.
          </p>
        )}

        {trail && trail.events.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">
            Aucun événement enregistré pour ce dossier.
          </p>
        )}

        {trail && trail.events.length > 0 && (
          <ol className="space-y-4">
            {trail.events.map((event) => (
              <AuditRow key={event.id} event={event} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
