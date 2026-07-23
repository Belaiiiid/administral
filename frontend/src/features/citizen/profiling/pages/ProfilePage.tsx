import { CircleEllipsis, HomeIcon, Pencil, UserRound, UsersRound } from 'lucide-react';

import { PageHeader, EmptyState } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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

interface ChampProgressif {
  cle: string;
  label: string;
  valeur: string | number | undefined;
}

/** Vue en temps réel du profil_partiel construit par la boucle A3. */
export default function ProfilePage() {
  useDocumentTitle('Mon profil citoyen');
  const profilPartiel = useProfilageStore((state) => state.profilPartiel);
  const dernierChampRempli = useProfilageStore((state) => state.dernierChampRempli);

  const estEnCouple = ['marie', 'pacse', 'concubinage'].includes(profilPartiel?.statut_marital ?? '');
  const aDesEnfants = (profilPartiel?.nombre_enfants_a_charge ?? 0) > 0;

  const champsFoyer: ChampProgressif[] = [
    { cle: 'statut_marital', label: 'Situation familiale', valeur: libelleStatutMarital(profilPartiel?.statut_marital ?? null) },
    ...(estEnCouple
      ? [
          { cle: 'statut_professionnel_conjoint', label: 'Situation professionnelle du conjoint', valeur: libelleStatutProfessionnel(profilPartiel?.statut_professionnel_conjoint ?? null) },
          { cle: 'revenus_conjoint_mensuels', label: 'Revenus mensuels du conjoint', valeur: libelleMontant(profilPartiel?.revenus_conjoint_mensuels ?? null) },
        ]
      : []),
    { cle: 'a_des_enfants_a_charge', label: 'Enfants à charge', valeur: libelleOuiNon(profilPartiel?.a_des_enfants_a_charge ?? null) },
    ...(profilPartiel?.a_des_enfants_a_charge ? [{ cle: 'nombre_enfants_a_charge', label: 'Nombre d’enfants à charge', valeur: profilPartiel?.nombre_enfants_a_charge ?? undefined }] : []),
    ...(aDesEnfants
      ? [
          { cle: 'ages_enfants', label: 'Âge(s) des enfants', valeur: libelleTexte(profilPartiel?.ages_enfants ?? null) },
          { cle: 'percoit_pension_alimentaire', label: 'Pension alimentaire perçue', valeur: libelleOuiNon(profilPartiel?.percoit_pension_alimentaire ?? null) },
          { cle: 'montant_pension_alimentaire', label: 'Montant de la pension', valeur: libelleMontant(profilPartiel?.montant_pension_alimentaire ?? null) },
        ]
      : []),
    { cle: 'nombre_adultes_rattaches', label: 'Personnes rattachées', valeur: profilPartiel?.nombre_adultes_rattaches ?? undefined },
  ].filter((champ) => champ.valeur !== undefined);

  const champsLogement: ChampProgressif[] = [
    { cle: 'situation_logement', label: 'Statut d’occupation', valeur: libelleStatutLogement(profilPartiel?.situation_logement ?? null) },
    { cle: 'type_location', label: 'Type de location', valeur: libelleTypeLocation(profilPartiel?.type_location ?? null) },
    { cle: 'loyer_mensuel', label: 'Loyer mensuel hors charges', valeur: libelleMontant(profilPartiel?.loyer_mensuel ?? null) },
    { cle: 'surface_m2', label: 'Surface habitable', valeur: libelleSurface(profilPartiel?.surface_m2 ?? null) },
    { cle: 'adresse', label: 'Adresse', valeur: libelleTexte(profilPartiel?.adresse ?? null) },
    { cle: 'code_postal', label: 'Code postal', valeur: libelleTexte(profilPartiel?.code_postal ?? null) },
    { cle: 'ville', label: 'Ville', valeur: libelleTexte(profilPartiel?.ville ?? null) },
    { cle: 'logement_appartient_a_un_proche', label: 'Bailleur = parent direct', valeur: libelleOuiNon(profilPartiel?.logement_appartient_a_un_proche ?? null) },
    { cle: 'logement_conventionne', label: 'Logement conventionné', valeur: libelleOuiNon(profilPartiel?.logement_conventionne ?? null) },
    { cle: 'moins_de_30_ans', label: 'Moins de 30 ans', valeur: libelleOuiNon(profilPartiel?.moins_de_30_ans ?? null) },
    { cle: 'sous_location_declaree', label: 'Sous-location déclarée', valeur: libelleOuiNon(profilPartiel?.sous_location_declaree ?? null) },
    { cle: 'type_residence_detail', label: 'Type de résidence', valeur: libelleTexte(profilPartiel?.type_residence_detail ?? null) },
    { cle: 'redevance_mensuelle', label: 'Redevance mensuelle', valeur: libelleMontant(profilPartiel?.redevance_mensuelle ?? null) },
  ].filter((champ) => champ.valeur !== undefined);

  return (
    <div className="mx-auto max-w-container">
      <PageHeader
        title="Mon profil citoyen"
        description="Gérez vos informations personnelles et vos préférences"
        actions={<Button type="button">Enregistrer les modifications</Button>}
      />

      <ProfilageAssistantPanel />

      <div className="grid gap-gutter lg:grid-cols-3">
        <ProfileCard title="Informations personnelles" icon={UserRound} action={
          <Button variant="ghost" size="icon" aria-label="Modifier les informations personnelles"><Pencil aria-hidden="true" /></Button>
        }>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <ChampAffiche label="Nom" valeur={profilPartiel?.nom ?? undefined} />
            <ChampAffiche label="Prénom" valeur={profilPartiel?.prenom ?? undefined} />
            <ChampAffiche label="Numéro de sécurité sociale" valeur={undefined} />
            <ChampAffiche label="Date de naissance" valeur={undefined} />
            <ChampAffiche label="Lieu de naissance" valeur={undefined} />
            <ChampAffiche label="Adresse e-mail" valeur={undefined} />
          </dl>
        </ProfileCard>

        <ProfileCard title="Composition du foyer" icon={UsersRound}>
          {champsFoyer.length ? <ChampsProgressifs champs={champsFoyer} dernierChamp={dernierChampRempli} /> : <EmptyProfileSection />}
        </ProfileCard>

        <ProfileCard title="Détails du logement" icon={HomeIcon}>
          {champsLogement.length ? <ChampsProgressifs champs={champsLogement} dernierChamp={dernierChampRempli} /> : <EmptyProfileSection />}
        </ProfileCard>
      </div>
    </div>
  );
}

function ProfileCard({ title, icon: Icon, action, children }: { title: string; icon: typeof UserRound; action?: React.ReactNode; children: React.ReactNode }) {
  return <Card className="min-h-[260px] overflow-hidden"><CardHeader className="flex-row items-center justify-between border-b border-border px-5 py-4"><span className="flex items-center gap-3"><Icon className="size-5 text-ai" aria-hidden="true" /><h2 className="text-label-md text-on-surface">{title}</h2></span>{action}</CardHeader><CardContent className="p-5">{children}</CardContent></Card>;
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
