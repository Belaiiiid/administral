import { Mail, ShieldCheck, UserRound } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getInitials } from '@/lib/utils';
import { AgentPage } from '@/features/agent/components';
import { useSessionStore } from '@/store/sessionStore';

/** Human-readable label for each back-office role. */
const ROLE_LABEL: Record<string, string> = {
  AGENT: 'Agent instructeur',
  ADMIN: 'Administrateur',
};

/**
 * The agent's own account — name, e-mail, role. Nothing else.
 *
 * Deliberately *not* the citizen profile page: an agent has no housing-aid
 * profile to declare, so the profiling assistant and its civil-status fields
 * have no place here. This is why the header's "Mon profil" is role-aware — it
 * lands agents here rather than on the citizen's profiling form.
 */
export default function AgentProfilePage() {
  const user = useSessionStore((state) => state.user);
  const displayName = useSessionStore((state) => state.displayName);

  const roleLabel = user ? (ROLE_LABEL[user.role] ?? user.role) : null;

  return (
    <AgentPage
      title="Mon profil"
      description="Les informations de votre compte agent."
      provisional={false}
    >
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <Avatar className="size-16 text-title-md">
            <AvatarFallback>
              {displayName ? getInitials(displayName) : <UserRound className="size-6" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <h2 className="text-headline-sm text-on-surface">{displayName ?? '—'}</h2>
            {roleLabel && (
              <Badge tone="info" className="mt-2">
                <ShieldCheck aria-hidden="true" />
                {roleLabel}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-gutter">
        <CardContent className="p-6">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Field label="Nom" value={user?.lastName} />
            <Field label="Prénom" value={user?.firstName} />
            <Field label="Adresse e-mail" value={user?.email} icon={<Mail className="size-4 text-on-surface-variant" aria-hidden="true" />} />
            <Field label="Rôle" value={roleLabel ?? undefined} />
          </dl>
        </CardContent>
      </Card>
    </AgentPage>
  );
}

function Field({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="flex items-center gap-2 text-body-md text-on-surface">
        {icon}
        {value || <span aria-hidden="true">—</span>}
      </dd>
    </div>
  );
}
