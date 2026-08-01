import { Loader2, Plus, UserPlus, UserCog, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { authService } from '@/services/authService';
import type { AuthUser, ProvisionStaffPayload } from '@/types';

export default function AdminDashboardPage() {
  useDocumentTitle('Administration');

  const [staff, setStaff] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'AGENT' | 'ADMIN'>('AGENT');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    authService
      .listStaff()
      .then(setStaff)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Impossible de charger les comptes.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreated(false);
    try {
      const payload: ProvisionStaffPayload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        role,
      };
      const newUser = await authService.provisionStaff(payload);
      setStaff((prev) => [newUser, ...prev]);
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRole('AGENT');
      setCreated(true);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'La création a échoué.');
    } finally {
      setCreating(false);
    }
  };

  const roleBadge = (r: string) => {
    const tones: Record<string, 'info' | 'accent' | 'neutral'> = {
      ADMIN: 'accent',
      AGENT: 'info',
      CITIZEN: 'neutral',
    };
    return <Badge tone={tones[r] ?? 'neutral'}>{r}</Badge>;
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-headline-lg text-on-surface">Administration</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Gérer les comptes agents et administrateurs
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-5" aria-hidden="true" />
              Créer un compte agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            {created && (
              <Alert tone="success" className="mb-5">
                <AlertDescription>Le compte a été créé avec succès.</AlertDescription>
              </Alert>
            )}
            {createError && (
              <Alert tone="error" className="mb-5">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}

            <form className="flex flex-col gap-4" onSubmit={handleCreate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="admin-firstName">Prénom</Label>
                  <Input
                    id="admin-firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    placeholder="Jean"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="admin-lastName">Nom</Label>
                  <Input
                    id="admin-lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    placeholder="Dupont"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="admin-email">Adresse e-mail</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="agent@monparcours.fr"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="admin-password">Mot de passe temporaire</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="8 caractères minimum"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="admin-role">Rôle</Label>
                <Select value={role} onValueChange={(v) => setRole(v as 'AGENT' | 'ADMIN')}>
                  <SelectTrigger id="admin-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AGENT">Agent</SelectItem>
                    <SelectItem value="ADMIN">Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" block disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Création…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 size-4" aria-hidden="true" />
                    Créer le compte
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" aria-hidden="true" />
              Comptes existants
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-6 animate-spin text-on-surface-variant" aria-hidden="true" />
              </div>
            ) : error ? (
              <Alert tone="error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : staff.length === 0 ? (
              <p className="py-4 text-center text-body-sm text-on-surface-variant">
                Aucun compte agent ou administrateur pour le moment.
              </p>
            ) : (
              <ul className="divide-y divide-border" role="list">
                {staff.map((user) => (
                  <li key={user.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-full bg-primary-fixed text-label-md text-primary-fixed-foreground">
                        <UserCog className="size-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-body-sm font-medium text-on-surface">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-body-sm text-on-surface-variant">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {roleBadge(user.role)}
                      {user.isVerified ? (
                        <Badge tone="success">Vérifié</Badge>
                      ) : (
                        <Badge tone="warning">En attente</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
