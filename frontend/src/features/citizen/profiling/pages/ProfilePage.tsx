import { CircleEllipsis, HomeIcon, Pencil, UserRound, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { PageHeader, EmptyState } from '@/components/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { birthDateError, socialSecurityNumberError } from '@/lib/civilStatusValidation';
import { cn } from '@/lib/utils';
import { ProfilageAssistantPanel } from '@/features/citizen/profiling/components/ProfilageAssistantPanel';
import {
  libelleMontant,
  libelleOuiNon,
  libelleStatutLogement,
  libelleStatutMarital,
  libelleStatutProfessionnel,
  libelleSurface,
  libelleTexte,
  libelleTypeLocation,
} from '@/features/citizen/profiling/utils/profilLabels';
import { useProfilageStore } from '@/features/citizen/profiling/store/profilageStore';
import {
  citizenProfileService,
  type CitizenProfilePersisted,
  type CitizenProfileUpdatePayload,
} from '@/features/citizen/profiling/services/citizenProfileService';
import type { ProfilPartiel } from '@/features/citizen/profiling/types/profilage';
import { ApiClientError } from '@/services/apiClient';

interface ChampProgressif {
  cle: string;
  label: string;
  valeur: string | number | undefined;
}

interface IdentityForm {
  firstName: string;
  lastName: string;
  birthDate: string;
  socialSecurityNumber: string;
}

const EMPTY_FORM: IdentityForm = { firstName: '', lastName: '', birthDate: '', socialSecurityNumber: '' };

/** Drops null/undefined keys so a live answer never overwrites a stored one with a blank. */
function nonNull<T extends object>(obj: T | null | undefined): Partial<T> {
  if (!obj) return {};
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<T>;
}

/** ISO `YYYY-MM-DD` → `JJ/MM/AAAA`. */
function formatDateFr(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function messageFromError(err: unknown): string {
  if (err instanceof ApiClientError) return err.payload.message;
  return err instanceof Error ? err.message : 'Une erreur est survenue.';
}

/**
 * Vue et édition du profil citoyen.
 *
 * Deux sources se rejoignent ici : ce que l'assistant de profilage a récolté
 * pendant la session en cours (le store Zustand, en mémoire) et ce qui est
 * réellement persisté en base (`GET /citizen/profile`). L'affichage privilégie
 * la valeur de session — la plus fraîche — quand elle existe, sinon la valeur
 * enregistrée. « Enregistrer les modifications » commit l'ensemble en base via
 * `PATCH /citizen/profile` : c'est le seul chemin d'écriture, le store ne
 * touche jamais la base tout seul.
 */
export default function ProfilePage() {
  useDocumentTitle('Mon profil citoyen');
  const profilPartiel = useProfilageStore((state) => state.profilPartiel);
  const dernierChampRempli = useProfilageStore((state) => state.dernierChampRempli);

  const [persisted, setPersisted] = useState<CitizenProfilePersisted | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<IdentityForm>(EMPTY_FORM);

  const [foyerForm, setFoyerForm] = useState<Partial<ProfilPartiel>>({});
  const [editFoyerOpen, setEditFoyerOpen] = useState(false);

  const [logementForm, setLogementForm] = useState<Partial<ProfilPartiel>>({});
  const [editLogementOpen, setEditLogementOpen] = useState(false);

  useEffect(() => {
    let active = true;
    citizenProfileService
      .obtenir()
      .then((data) => {
        if (!active) return;
        setPersisted(data);
        setForm({
          firstName: data.firstName,
          lastName: data.lastName,
          birthDate: data.birthDate ?? '',
          socialSecurityNumber: '',
        });
      })
      .catch((err) => {
        if (active) setLoadError(messageFromError(err));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Session answers win over stored ones, per field: a blank live field never
  // erases what is already in the database.
  const answers = useMemo<Partial<ProfilPartiel>>(
    () => ({ ...(persisted?.profile ?? {}), ...nonNull(profilPartiel), ...nonNull(foyerForm), ...nonNull(logementForm) }),
    [persisted, profilPartiel, foyerForm, logementForm],
  );

  const prenomAffiche = profilPartiel?.prenom || form.firstName || undefined;
  const nomAffiche = profilPartiel?.nom || form.lastName || undefined;

  const birthDateInvalid = birthDateError(form.birthDate);
  const nirInvalid = form.socialSecurityNumber ? socialSecurityNumberError(form.socialSecurityNumber) : null;
  const identityInvalid = Boolean(birthDateInvalid) || Boolean(nirInvalid);

  const estEnCouple = ['marie', 'pacse', 'concubinage'].includes(answers.statut_marital ?? '');
  const aDesEnfants = (answers.nombre_enfants_a_charge ?? 0) > 0;

  const champsFoyer: ChampProgressif[] = [
    { cle: 'statut_marital', label: 'Situation familiale', valeur: libelleStatutMarital(answers.statut_marital ?? null) },
    ...(estEnCouple
      ? [
          { cle: 'statut_professionnel_conjoint', label: 'Situation professionnelle du conjoint', valeur: libelleStatutProfessionnel(answers.statut_professionnel_conjoint ?? null) },
          { cle: 'revenus_conjoint_mensuels', label: 'Revenus mensuels du conjoint', valeur: libelleMontant(answers.revenus_conjoint_mensuels ?? null) },
        ]
      : []),
    { cle: 'a_des_enfants_a_charge', label: 'Enfants à charge', valeur: libelleOuiNon(answers.a_des_enfants_a_charge ?? null) },
    ...(answers.a_des_enfants_a_charge ? [{ cle: 'nombre_enfants_a_charge', label: 'Nombre d’enfants à charge', valeur: answers.nombre_enfants_a_charge ?? undefined }] : []),
    ...(aDesEnfants
      ? [
          { cle: 'ages_enfants', label: 'Âge(s) des enfants', valeur: libelleTexte(answers.ages_enfants ?? null) },
          { cle: 'percoit_pension_alimentaire', label: 'Pension alimentaire perçue', valeur: libelleOuiNon(answers.percoit_pension_alimentaire ?? null) },
          { cle: 'montant_pension_alimentaire', label: 'Montant de la pension', valeur: libelleMontant(answers.montant_pension_alimentaire ?? null) },
        ]
      : []),
    { cle: 'nombre_adultes_rattaches', label: 'Personnes rattachées', valeur: answers.nombre_adultes_rattaches ?? undefined },
  ].filter((champ) => champ.valeur !== undefined);

  const champsLogement: ChampProgressif[] = [
    { cle: 'situation_logement', label: 'Statut d’occupation', valeur: libelleStatutLogement(answers.situation_logement ?? null) },
    { cle: 'type_location', label: 'Type de location', valeur: libelleTypeLocation(answers.type_location ?? null) },
    { cle: 'loyer_mensuel', label: 'Loyer mensuel hors charges', valeur: libelleMontant(answers.loyer_mensuel ?? null) },
    { cle: 'surface_m2', label: 'Surface habitable', valeur: libelleSurface(answers.surface_m2 ?? null) },
    { cle: 'adresse', label: 'Adresse', valeur: libelleTexte(answers.adresse ?? null) },
    { cle: 'code_postal', label: 'Code postal', valeur: libelleTexte(answers.code_postal ?? null) },
    { cle: 'ville', label: 'Ville', valeur: libelleTexte(answers.ville ?? null) },
    { cle: 'logement_appartient_a_un_proche', label: 'Bailleur = parent direct', valeur: libelleOuiNon(answers.logement_appartient_a_un_proche ?? null) },
    { cle: 'logement_conventionne', label: 'Logement conventionné', valeur: libelleOuiNon(answers.logement_conventionne ?? null) },
    { cle: 'moins_de_30_ans', label: 'Moins de 30 ans', valeur: libelleOuiNon(answers.moins_de_30_ans ?? null) },
    { cle: 'sous_location_declaree', label: 'Sous-location déclarée', valeur: libelleOuiNon(answers.sous_location_declaree ?? null) },
    { cle: 'type_residence_detail', label: 'Type de résidence', valeur: libelleTexte(answers.type_residence_detail ?? null) },
    { cle: 'redevance_mensuelle', label: 'Redevance mensuelle', valeur: libelleMontant(answers.redevance_mensuelle ?? null) },
  ].filter((champ) => champ.valeur !== undefined);

  const buildPayload = (): CitizenProfileUpdatePayload => {
    const payload: CitizenProfileUpdatePayload = {};

    const firstName = (profilPartiel?.prenom || form.firstName).trim();
    const lastName = (profilPartiel?.nom || form.lastName).trim();
    if (firstName && firstName !== persisted?.firstName) payload.firstName = firstName;
    if (lastName && lastName !== persisted?.lastName) payload.lastName = lastName;

    const birthDate = form.birthDate || null;
    if (birthDate !== (persisted?.birthDate ?? null)) payload.birthDate = birthDate;

    const nir = form.socialSecurityNumber.replace(/\D/g, '');
    if (nir) payload.socialSecurityNumber = nir;

    // The assistant's session answers — identity (nom/prenom) is sent above, so
    // strip it here to keep this to profiling fields only.
    const sessionAnswers = nonNull(profilPartiel);
    delete sessionAnswers.derniere_maj;
    delete sessionAnswers.nom;
    delete sessionAnswers.prenom;
    
    const mergedProfile = { ...sessionAnswers, ...nonNull(foyerForm), ...nonNull(logementForm) };
    if (Object.keys(mergedProfile).length > 0) payload.profile = mergedProfile;

    return payload;
  };

  const handleSave = async () => {
    if (identityInvalid) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = buildPayload();
      if (Object.keys(payload).length === 0) {
        setFeedback({ tone: 'success', message: 'Aucune modification à enregistrer.' });
        return;
      }
      const updated = await citizenProfileService.mettreAJour(payload);
      setPersisted(updated);
      setForm({
        firstName: updated.firstName,
        lastName: updated.lastName,
        birthDate: updated.birthDate ?? '',
        socialSecurityNumber: '',
      });
      setFeedback({ tone: 'success', message: 'Vos modifications ont été enregistrées.' });
    } catch (err) {
      setFeedback({ tone: 'error', message: messageFromError(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const openEditDialog = () => {
    setForm((current) => ({
      ...current,
      firstName: profilPartiel?.prenom || current.firstName,
      lastName: profilPartiel?.nom || current.lastName,
    }));
    setEditOpen(true);
  };

  const openEditFoyerDialog = () => {
    setFoyerForm((current) => ({ ...answers, ...current }));
    setEditFoyerOpen(true);
  };

  const openEditLogementDialog = () => {
    setLogementForm((current) => ({ ...answers, ...current }));
    setEditLogementOpen(true);
  };

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mon profil citoyen"
        description="Gérez vos informations personnelles et vos préférences"
        actions={
          <Button type="button" onClick={handleSave} disabled={isLoading || isSaving || identityInvalid}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </Button>
        }
      />

      {loadError && (
        <Alert tone="error" className="mb-gutter">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}
      {feedback && (
        <Alert tone={feedback.tone} className="mb-gutter">
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <ProfilageAssistantPanel />

      <div className="grid gap-gutter lg:grid-cols-3">
        <ProfileCard
          title="Informations personnelles"
          icon={UserRound}
          action={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Modifier les informations personnelles"
              onClick={openEditDialog}
              disabled={isLoading}
            >
              <Pencil aria-hidden="true" />
            </Button>
          }
        >
          {isLoading ? (
            <IdentitySkeleton />
          ) : (
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <ChampAffiche label="Nom" valeur={nomAffiche} />
              <ChampAffiche label="Prénom" valeur={prenomAffiche} />
              <ChampAffiche
                label="Numéro de sécurité sociale"
                valeur={persisted?.socialSecurityNumberMasked ?? undefined}
              />
              <ChampAffiche label="Date de naissance" valeur={formatDateFr(form.birthDate || persisted?.birthDate)} />
              <ChampAffiche label="Adresse e-mail" valeur={persisted?.email} />
            </dl>
          )}
        </ProfileCard>

        <ProfileCard
          title="Composition du foyer"
          icon={UsersRound}
          action={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Modifier la composition du foyer"
              onClick={openEditFoyerDialog}
              disabled={isLoading}
            >
              <Pencil aria-hidden="true" />
            </Button>
          }
        >
          {champsFoyer.length ? <ChampsProgressifs champs={champsFoyer} dernierChamp={dernierChampRempli} /> : <EmptyProfileSection />}
        </ProfileCard>

        <ProfileCard
          title="Détails du logement"
          icon={HomeIcon}
          action={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Modifier les détails du logement"
              onClick={openEditLogementDialog}
              disabled={isLoading}
            >
              <Pencil aria-hidden="true" />
            </Button>
          }
        >
          {champsLogement.length ? <ChampsProgressifs champs={champsLogement} dernierChamp={dernierChampRempli} /> : <EmptyProfileSection />}
        </ProfileCard>
      </div>

      <EditIdentityDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        form={form}
        setForm={setForm}
        hasNir={persisted?.hasSocialSecurityNumber ?? false}
      />
      
      <EditFoyerDialog
        open={editFoyerOpen}
        onOpenChange={setEditFoyerOpen}
        form={foyerForm}
        setForm={setFoyerForm}
      />
      
      <EditLogementDialog
        open={editLogementOpen}
        onOpenChange={setEditLogementOpen}
        form={logementForm}
        setForm={setLogementForm}
      />
    </div>
  );
}

function EditIdentityDialog({
  open,
  onOpenChange,
  form,
  setForm,
  hasNir,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: IdentityForm;
  setForm: React.Dispatch<React.SetStateAction<IdentityForm>>;
  hasNir: boolean;
}) {
  const set = (patch: Partial<IdentityForm>) => setForm((current) => ({ ...current, ...patch }));

  const birthDateInvalid = birthDateError(form.birthDate);
  const nirInvalid = form.socialSecurityNumber ? socialSecurityNumberError(form.socialSecurityNumber) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Informations personnelles</DialogTitle>
          <DialogDescription>
            Ces modifications sont enregistrées lorsque vous cliquez sur « Enregistrer les
            modifications ».
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-prenom">Prénom</Label>
            <Input id="edit-prenom" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-nom">Nom</Label>
            <Input id="edit-nom" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-naissance">Date de naissance</Label>
            <Input
              id="edit-naissance"
              type="date"
              value={form.birthDate}
              aria-invalid={Boolean(birthDateInvalid)}
              onChange={(e) => set({ birthDate: e.target.value })}
            />
            {birthDateInvalid && (
              <p role="alert" className="text-body-sm text-destructive">
                {birthDateInvalid}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-nir">Numéro de sécurité sociale</Label>
            <Input
              id="edit-nir"
              inputMode="numeric"
              placeholder={hasNir ? 'Renseigné — laisser vide pour ne pas modifier' : '13 ou 15 chiffres'}
              value={form.socialSecurityNumber}
              aria-invalid={Boolean(nirInvalid)}
              onChange={(e) => set({ socialSecurityNumber: e.target.value })}
            />
            {nirInvalid && (
              <p role="alert" className="text-body-sm text-destructive">
                {nirInvalid}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)} disabled={Boolean(birthDateInvalid) || Boolean(nirInvalid)}>
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileCard({ title, icon: Icon, action, children }: { title: string; icon: typeof UserRound; action?: ReactNode; children: ReactNode }) {
  return <Card className="min-h-[260px] overflow-hidden"><CardHeader className="flex-row items-center justify-between border-b border-border px-5 py-4"><span className="flex items-center gap-3"><Icon className="size-5 text-ai" aria-hidden="true" /><h2 className="text-label-md text-on-surface">{title}</h2></span>{action}</CardHeader><CardContent className="p-5">{children}</CardContent></Card>;
}

function IdentitySkeleton() {
  return (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-36" />
        </div>
      ))}
    </div>
  );
}

function EmptyProfileSection() {
  return <EmptyState icon={CircleEllipsis} size="compact" title="" description="Aucune information pour le moment — répondez aux questions de l’assistant pour compléter cette section." className="min-h-[170px] justify-center [&_h3]:hidden" />;
}

function ChampsProgressifs({ champs, dernierChamp }: { champs: ChampProgressif[]; dernierChamp: string | null }) {
  return <dl className="grid gap-5">{champs.map((champ) => <ChampAffiche key={champ.cle} {...champ} nouveau={champ.cle === dernierChamp} />)}</dl>;
}

function ChampAffiche({ label, valeur, nouveau = false }: Omit<ChampProgressif, 'cle'> & { nouveau?: boolean }) {
  return <div className={cn('transition-all duration-500 ease-standard', nouveau && 'animate-in fade-in slide-in-from-bottom-2 rounded-lg bg-primary-fixed p-2 -m-2')}><dt className="mb-1 text-label-sm text-on-surface-variant">{label}</dt><dd className="text-body-sm text-on-surface">{valeur === undefined || valeur === '' ? <><span aria-hidden="true">—</span><span className="sr-only">Non renseigné</span></> : String(valeur)}</dd></div>;
}

function EditFoyerDialog({
  open,
  onOpenChange,
  form,
  setForm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: Partial<ProfilPartiel>;
  setForm: React.Dispatch<React.SetStateAction<Partial<ProfilPartiel>>>;
}) {
  const set = (patch: Partial<ProfilPartiel>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Composition du foyer</DialogTitle>
          <DialogDescription>
            Ces modifications sont enregistrées lorsque vous cliquez sur « Enregistrer les
            modifications ».
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Situation familiale */}
          <div className="flex flex-col gap-2">
            <Label>Situation familiale</Label>
            <Select value={form.statut_marital || undefined} onValueChange={(v) => set({ statut_marital: v as ProfilPartiel['statut_marital'] })}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="celibataire">Célibataire</SelectItem>
                <SelectItem value="marie">Marié(e)</SelectItem>
                <SelectItem value="pacse">Pacsé(e)</SelectItem>
                <SelectItem value="concubinage">En concubinage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Enfants à charge */}
          <div className="flex flex-col gap-2">
            <Label>Enfants à charge</Label>
            <Select value={form.a_des_enfants_a_charge === true ? 'oui' : form.a_des_enfants_a_charge === false ? 'non' : undefined} onValueChange={(v) => set({ a_des_enfants_a_charge: v === 'oui' })}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nombre d'enfants */}
          {form.a_des_enfants_a_charge && (
            <div className="flex flex-col gap-2">
              <Label>Nombre d'enfants à charge</Label>
              <Input type="number" min="0" value={form.nombre_enfants_a_charge ?? ''} onChange={(e) => set({ nombre_enfants_a_charge: e.target.value ? parseInt(e.target.value) : null })} />
            </div>
          )}

          {/* Âges enfants */}
          {form.a_des_enfants_a_charge && (
            <div className="flex flex-col gap-2">
              <Label>Âge(s) des enfants (ex: 5, 8)</Label>
              <Input value={form.ages_enfants ?? ''} onChange={(e) => set({ ages_enfants: e.target.value })} />
            </div>
          )}

          {/* Pension alimentaire perçue */}
          {form.a_des_enfants_a_charge && (
            <div className="flex flex-col gap-2">
              <Label>Pension alimentaire perçue</Label>
              <Select value={form.percoit_pension_alimentaire === true ? 'oui' : form.percoit_pension_alimentaire === false ? 'non' : undefined} onValueChange={(v) => set({ percoit_pension_alimentaire: v === 'oui' })}>
                <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="oui">Oui</SelectItem>
                  <SelectItem value="non">Non</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Montant pension */}
          {form.percoit_pension_alimentaire && (
            <div className="flex flex-col gap-2">
              <Label>Montant de la pension (€)</Label>
              <Input type="number" min="0" value={form.montant_pension_alimentaire ?? ''} onChange={(e) => set({ montant_pension_alimentaire: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
          )}

          {/* Situation conjoint */}
          {['marie', 'pacse', 'concubinage'].includes(form.statut_marital ?? '') && (
            <>
              <div className="flex flex-col gap-2">
                <Label>Situation professionnelle du conjoint</Label>
                <Select value={form.statut_professionnel_conjoint || undefined} onValueChange={(v) => set({ statut_professionnel_conjoint: v as ProfilPartiel['statut_professionnel_conjoint'] })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="etudiant">Étudiant</SelectItem>
                    <SelectItem value="apprenti_alternant">Apprenti / Alternant</SelectItem>
                    <SelectItem value="salarie">Salarié</SelectItem>
                    <SelectItem value="demandeur_emploi">Demandeur d'emploi</SelectItem>
                    <SelectItem value="independant">Indépendant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Revenus mensuels du conjoint (€)</Label>
                <Input type="number" min="0" value={form.revenus_conjoint_mensuels ?? ''} onChange={(e) => set({ revenus_conjoint_mensuels: e.target.value ? parseFloat(e.target.value) : null })} />
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label>Autres personnes rattachées</Label>
            <Input type="number" min="0" value={form.nombre_adultes_rattaches ?? ''} onChange={(e) => set({ nombre_adultes_rattaches: e.target.value ? parseInt(e.target.value) : null })} />
          </div>

        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>Appliquer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLogementDialog({
  open,
  onOpenChange,
  form,
  setForm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: Partial<ProfilPartiel>;
  setForm: React.Dispatch<React.SetStateAction<Partial<ProfilPartiel>>>;
}) {
  const set = (patch: Partial<ProfilPartiel>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détails du logement</DialogTitle>
          <DialogDescription>
            Ces modifications sont enregistrées lorsque vous cliquez sur « Enregistrer les
            modifications ».
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Situation logement */}
          <div className="flex flex-col gap-2">
            <Label>Statut d’occupation</Label>
            <Select value={form.situation_logement || undefined} onValueChange={(v) => set({ situation_logement: v as ProfilPartiel['situation_logement'] })}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="locataire">Locataire</SelectItem>
                <SelectItem value="proprietaire">Propriétaire</SelectItem>
                <SelectItem value="heberge">Hébergé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type location */}
          {form.situation_logement === 'locataire' && (
            <div className="flex flex-col gap-2">
              <Label>Type de location</Label>
              <Select value={form.type_location || undefined} onValueChange={(v) => set({ type_location: v as ProfilPartiel['type_location'] })}>
                <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vide">Vide</SelectItem>
                  <SelectItem value="meublee">Meublée</SelectItem>
                  <SelectItem value="colocation">Colocation</SelectItem>
                  <SelectItem value="chambre">Chambre</SelectItem>
                  <SelectItem value="sous_location">Sous-location</SelectItem>
                  <SelectItem value="residence_etudiante">Résidence étudiante</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Loyer / Surface */}
          <div className="flex flex-col gap-2">
            <Label>Loyer / Redevance mensuel (€)</Label>
            <Input type="number" min="0" value={form.loyer_mensuel ?? form.redevance_mensuelle ?? ''} onChange={(e) => {
              const val = e.target.value ? parseFloat(e.target.value) : null;
              if (form.type_location === 'residence_etudiante') {
                set({ redevance_mensuelle: val, loyer_mensuel: null });
              } else {
                set({ loyer_mensuel: val, redevance_mensuelle: null });
              }
            }} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Surface (m²)</Label>
            <Input type="number" min="0" value={form.surface_m2 ?? ''} onChange={(e) => set({ surface_m2: e.target.value ? parseFloat(e.target.value) : null })} />
          </div>

          {/* Adresse */}
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Adresse</Label>
            <Input value={form.adresse ?? ''} onChange={(e) => set({ adresse: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Code postal</Label>
            <Input value={form.code_postal ?? ''} onChange={(e) => set({ code_postal: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Ville</Label>
            <Input value={form.ville ?? ''} onChange={(e) => set({ ville: e.target.value })} />
          </div>

          {/* Boolean fields */}
          <div className="flex flex-col gap-2">
            <Label>Bailleur = parent direct</Label>
            <Select value={form.logement_appartient_a_un_proche === true ? 'oui' : form.logement_appartient_a_un_proche === false ? 'non' : undefined} onValueChange={(v) => set({ logement_appartient_a_un_proche: v === 'oui' })}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex flex-col gap-2">
            <Label>Logement conventionné</Label>
            <Select value={form.logement_conventionne === true ? 'oui' : form.logement_conventionne === false ? 'non' : undefined} onValueChange={(v) => set({ logement_conventionne: v === 'oui' })}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex flex-col gap-2">
            <Label>Moins de 30 ans</Label>
            <Select value={form.moins_de_30_ans === true ? 'oui' : form.moins_de_30_ans === false ? 'non' : undefined} onValueChange={(v) => set({ moins_de_30_ans: v === 'oui' })}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex flex-col gap-2">
            <Label>Sous-location déclarée</Label>
            <Select value={form.sous_location_declaree === true ? 'oui' : form.sous_location_declaree === false ? 'non' : undefined} onValueChange={(v) => set({ sous_location_declaree: v === 'oui' })}>
              <SelectTrigger><SelectValue placeholder="Sélectionnez..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">Oui</SelectItem>
                <SelectItem value="non">Non</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>Appliquer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
