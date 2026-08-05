import { AlertTriangle, CheckCircle2, FileWarning, ShieldAlert } from 'lucide-react';

import { SectionHeader } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { StatusTone } from '@/types';

/**
 * Détection de fraude — section statique.
 *
 * Cet écran n'appelle **pas** l'agent C4 : les signaux ci-dessous sont écrits en
 * dur dans `FRAUD_SIGNALS` / `CLEARED_CHECKS`. C'est assumé et visible dans
 * l'interface (bandeau « Analyse de démonstration ») pour qu'une donnée figée ne
 * puisse jamais passer pour un résultat d'analyse — la règle posée dans
 * `docs/roadmap.md`, « Points d'attention », point 5.
 *
 * Brancher le backend consiste à remplacer les deux constantes par le rapport
 * renvoyé par `POST /api/agent/cases/{id}/fraud` : la forme des objets est déjà
 * celle de la réponse attendue, aucun composant ci-dessous n'a à changer.
 *
 * Vocabulaire : le pourcentage affiché devant chaque signal est la **confiance
 * du moteur dans ce signal précis**, pas une probabilité de fraude et pas un
 * score de risque global. La distinction est reprise telle quelle dans l'UI —
 * un agent qui lit « 94 % » ne doit pas comprendre « ce dossier est frauduleux
 * à 94 % ».
 */

type SignalSeverity = 'confirme' | 'probable' | 'faible';

interface FraudSignal {
  id: string;
  /** 0–100. Confiance du moteur dans *ce* signal. */
  confidence: number;
  severity: SignalSeverity;
  /** Ce qui a été détecté, en une ligne lisible par un agent non technique. */
  title: string;
  /** Le contrôle d'où vient le signal, dans le vocabulaire du pipeline C4. */
  detector: string;
  document: string;
  /** « Page 1 · bloc “Net imposable” » — où regarder dans la pièce. */
  location: string;
  /** Le constat brut, sans interprétation. */
  observed: string;
  /** Pourquoi ce constat est un signal — c'est l'interprétation, isolée. */
  reason: string;
  /** L'action attendue de l'agent. Un signal ne décide jamais seul. */
  toVerify: string;
  /** Les valeurs techniques sur lesquelles le constat s'appuie. */
  evidence: { label: string; value: string }[];
}

interface ClearedCheck {
  label: string;
  detail: string;
}

/** ─── Données statiques ─────────────────────────────────────────────────── */

const FRAUD_SIGNALS: FraudSignal[] = [
  {
    id: 'metadata-producer-mismatch',
    confidence: 94,
    severity: 'confirme',
    title: 'Le fichier a été réédité après sa création',
    detector: 'Informations du fichier',
    document: 'Bulletin de salaire — juin 2026.pdf',
    location: 'Métadonnées du document',
    observed:
      'Le document a été créé le 02/06/2026 par « Sage Paie 100c », puis modifié le 09/06/2026 par « Adobe Acrobat Pro 24.2 ». Les deux logiciels sont inscrits dans le même fichier.',
    reason:
      'Un bulletin émis par un logiciel de paie n’est pas censé être rouvert dans un éditeur PDF avant d’être transmis. L’écart de sept jours entre l’émission et la réédition, associé au changement d’outil, est le signal de métadonnées le plus fiable du pipeline.',
    toVerify:
      'Demander le bulletin d’origine à l’employeur, ou l’attestation de salaire correspondante. Comparer le net imposable avec l’avis d’imposition déjà au dossier.',
    evidence: [
      { label: 'Logiciel de création', value: 'Sage Paie 100c' },
      { label: 'Logiciel de modification', value: 'Adobe Acrobat Pro 24.2' },
      { label: 'Création', value: '02/06/2026 08:41' },
      { label: 'Modification', value: '09/06/2026 22:17' },
      { label: 'Signature PDF', value: 'Absente' },
    ],
  },
  {
    id: 'copy-move-amount',
    confidence: 87,
    severity: 'confirme',
    title: 'Un montant semble avoir été recomposé',
    detector: 'Recherche de zones copiées',
    document: 'Bulletin de salaire — juin 2026.pdf',
    location: 'Page 1 · bloc « Net imposable »',
    observed:
      'Les caractères du montant « 1 480,00 » ne partagent ni la même police intégrée ni la même ligne de base que le reste du tableau. Deux glyphes sont dupliqués au pixel près depuis une autre zone de la page.',
    reason:
      'Une duplication exacte de glyphes ne se produit pas lors d’une génération native : le moteur de paie rend chaque caractère indépendamment. Ce motif est caractéristique d’un montant recouvert puis retapé dans un éditeur.',
    toVerify:
      'Confronter le net imposable déclaré au montant porté sur l’attestation employeur et, si l’écart se confirme, ouvrir une demande de pièce complémentaire avant toute décision.',
    evidence: [
      { label: 'Zone concernée', value: 'x 412 · y 268 · 96 × 18 px' },
      { label: 'Glyphes dupliqués', value: '2 sur 8' },
      { label: 'Police du bloc', value: 'Helvetica (intégrée)' },
      { label: 'Police du reste du tableau', value: 'Arial (intégrée)' },
    ],
  },
  {
    id: 'ela-local-recompression',
    confidence: 71,
    severity: 'probable',
    title: 'Une zone de l’image a été recompressée seule',
    detector: 'Analyse de compression (ELA)',
    document: 'Quittance de loyer — mai 2026.jpg',
    location: 'Page 1 · en-tête, zone de la date',
    observed:
      'Le niveau d’erreur de compression de la zone de la date est nettement supérieur à celui du reste de l’image (écart de 34 points sur l’échelle ELA).',
    reason:
      'Une image capturée puis enregistrée une seule fois présente un niveau de compression homogène. Une zone qui ressort seule a été modifiée puis réenregistrée après le reste — sans que cela prouve, à ce stade, une intention.',
    toVerify:
      'Vérifier que la date de la quittance correspond à la période déclarée et au bail. Un scan de mauvaise qualité ou une retouche de cadrage produisent parfois le même signal.',
    evidence: [
      { label: 'Écart ELA', value: '+34 points' },
      { label: 'Zone concernée', value: 'x 88 · y 122 · 210 × 32 px' },
      { label: 'Qualité JPEG estimée', value: '78 % (zone) / 92 % (page)' },
      { label: 'Corroboré par un autre contrôle', value: 'Non' },
    ],
  },
  {
    id: 'ocr-baseline-drift',
    confidence: 38,
    severity: 'faible',
    title: 'Alignement irrégulier sur une ligne du tableau',
    detector: 'Structure du texte',
    document: 'Quittance de loyer — mai 2026.jpg',
    location: 'Page 1 · ligne « Montant du loyer »',
    observed:
      'La ligne de base du texte dévie de 1,8 px sur la ligne du montant par rapport aux lignes voisines.',
    reason:
      'Une déviation de cet ordre est fréquemment produite par un scan légèrement incliné. Elle n’est retenue que parce qu’elle touche la même pièce qu’un signal de compression, et jamais isolément.',
    toVerify:
      'Aucune action spécifique. À considérer uniquement si la vérification de la date ci-dessus confirme une anomalie.',
    evidence: [
      { label: 'Déviation mesurée', value: '1,8 px' },
      { label: 'Seuil de déclenchement', value: '1,5 px' },
      { label: 'Corroboré par un autre contrôle', value: 'Non' },
    ],
  },
];

const CLEARED_CHECKS: ClearedCheck[] = [
  { label: 'Empreinte du fichier', detail: 'Aucun doublon connu dans les dossiers déjà instruits' },
  { label: 'Codes QR et MRZ', detail: 'Aucun code à vérifier sur les pièces déposées' },
  { label: 'Analyse du bruit', detail: 'Répartition homogène sur les trois pièces' },
  { label: 'Cohérence des polices', detail: 'Conforme sur l’avis d’imposition et le bail' },
];

/** ─── Présentation ──────────────────────────────────────────────────────── */

const SEVERITY_LABEL: Record<SignalSeverity, string> = {
  confirme: 'Signal confirmé',
  probable: 'Signal probable',
  faible: 'Signal faible',
};

const SEVERITY_TONE: Record<SignalSeverity, StatusTone> = {
  confirme: 'error',
  probable: 'warning',
  faible: 'neutral',
};

/** Couleur du score de confiance — même échelle que les niveaux de signal. */
const SEVERITY_ACCENT: Record<SignalSeverity, string> = {
  confirme: 'text-destructive',
  probable: 'text-warning',
  faible: 'text-on-surface-variant',
};

const SEVERITY_BAR: Record<SignalSeverity, string> = {
  confirme: 'bg-destructive',
  probable: 'bg-warning',
  faible: 'bg-outline',
};

export function CaseFraudDetectionCard() {
  const actionable = FRAUD_SIGNALS.filter((signal) => signal.severity !== 'faible');
  const documentsFlagged = new Set(actionable.map((signal) => signal.document)).size;

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Détection de fraude"
          as="h2"
          action={
            <Badge tone="error">
              <ShieldAlert aria-hidden="true" />
              {actionable.length} signal{actionable.length > 1 ? 'aux' : ''} à traiter
            </Badge>
          }
        />
      </CardHeader>

      <CardContent className="space-y-gutter">
        {/* L'origine des données est dite avant les données elles-mêmes. */}
        <p className="rounded-lg border border-dashed border-border-strong bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
          <span className="font-medium text-on-surface">Analyse de démonstration.</span>{' '}
          Les signaux ci-dessous sont figés dans l’interface : l’agent d’analyse
          n’est pas interrogé depuis cet écran. Ils illustrent la restitution
          attendue, pas l’état réel de ce dossier.
        </p>

        {/* Synthèse : ce qu'un agent doit retenir avant d'ouvrir le détail. */}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Signaux retenus', value: String(FRAUD_SIGNALS.length) },
            { label: 'À traiter', value: String(actionable.length) },
            { label: 'Pièces concernées', value: String(documentsFlagged) },
            { label: 'Contrôles sans anomalie', value: String(CLEARED_CHECKS.length) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border p-3">
              <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                {stat.label}
              </dt>
              <dd className="mt-1 text-headline-md text-on-surface">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <p className="text-body-sm text-on-surface-variant">
          Le pourcentage porté devant chaque signal est la{' '}
          <strong className="text-on-surface">confiance du moteur dans ce signal</strong> — pas une
          probabilité de fraude, et pas un score attribué à l’allocataire. Aucun
          signal ne vaut décision : chacun ouvre une vérification.
        </p>

        <ul className="space-y-gutter">
          {FRAUD_SIGNALS.map((signal) => (
            <li key={signal.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                {/* Le score de confiance, devant le signal qu'il qualifie. */}
                <div
                  className="flex shrink-0 flex-row items-center gap-3 sm:w-24 sm:flex-col sm:items-start sm:gap-2"
                  role="img"
                  aria-label={`Confiance ${signal.confidence} %, ${SEVERITY_LABEL[signal.severity].toLowerCase()}`}
                >
                  <span
                    className={cn(
                      'text-headline-lg tabular-nums',
                      SEVERITY_ACCENT[signal.severity],
                    )}
                  >
                    {signal.confidence}
                    <span className="text-headline-md"> %</span>
                  </span>
                  <div className="w-full space-y-1">
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-highest"
                      aria-hidden="true"
                    >
                      <div
                        className={cn('h-full rounded-full', SEVERITY_BAR[signal.severity])}
                        style={{ width: `${signal.confidence}%` }}
                      />
                    </div>
                    <span className="block text-label-sm uppercase tracking-wider text-on-surface-variant">
                      Confiance
                    </span>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-label-md text-on-surface">{signal.title}</h3>
                    <Badge tone={SEVERITY_TONE[signal.severity]}>
                      {SEVERITY_LABEL[signal.severity]}
                    </Badge>
                  </div>

                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-on-surface-variant">
                    <FileWarning className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate text-on-surface">{signal.document}</span>
                    <span aria-hidden="true">·</span>
                    <span>{signal.location}</span>
                    <span aria-hidden="true">·</span>
                    <span>contrôle : {signal.detector}</span>
                  </p>

                  {/* Constat, interprétation, action : séparés pour que l'agent
                      voie ce qui est mesuré et ce qui en est déduit. */}
                  <dl className="space-y-3 border-l-2 border-border pl-4">
                    <div>
                      <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                        Ce qui a été observé
                      </dt>
                      <dd className="mt-1 text-body-sm text-on-surface">{signal.observed}</dd>
                    </div>
                    <div>
                      <dt className="text-label-sm uppercase tracking-wider text-on-surface-variant">
                        Pourquoi c’est un signal
                      </dt>
                      <dd className="mt-1 text-body-sm text-on-surface">{signal.reason}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1.5 text-label-sm uppercase tracking-wider text-on-surface-variant">
                        <AlertTriangle className="size-3.5" aria-hidden="true" />À vérifier
                      </dt>
                      <dd className="mt-1 text-body-sm text-on-surface">{signal.toVerify}</dd>
                    </div>
                  </dl>

                  <details className="rounded-lg border border-border p-3">
                    <summary className="cursor-pointer text-label-md font-medium text-on-surface-variant hover:text-on-surface">
                      Éléments techniques
                    </summary>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 pt-3 text-body-sm sm:grid-cols-2">
                      {signal.evidence.map((item) => (
                        <div key={item.label} className="flex justify-between gap-4 sm:block">
                          <dt className="text-on-surface-variant">{item.label}</dt>
                          <dd className="break-words text-on-surface sm:mt-0.5">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Ce qui n'a rien donné compte autant : sans cette liste, l'agent ne
            sait pas si l'analyse est complète ou seulement partielle. */}
        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-label-md font-medium text-on-surface-variant hover:text-on-surface">
            Contrôles passés sans anomalie ({CLEARED_CHECKS.length})
          </summary>
          <ul className="space-y-2 pt-3">
            {CLEARED_CHECKS.map((check) => (
              <li key={check.label} className="flex gap-2 text-body-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  <span className="text-on-surface">{check.label}</span>{' '}
                  <span className="text-on-surface-variant">— {check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}
