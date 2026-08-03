import { ArrowRight, CheckCircle2, Edit3, FileCheck2, FileText, MessageSquare, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';

const PROMPT_CHIPS = [
  { icon: CheckCircle2, text: 'Expliquer mes droits APL', tone: 'text-emerald-500' },
  { icon: FileText, text: 'Résumer ma situation CAF', tone: 'text-sky-500' },
  { icon: Edit3, text: 'Rédiger un courrier administratif', tone: 'text-purple-500' },
];

const IA_FEATURES = [
  {
    icon: MessageSquare,
    title: 'Langage naturel',
    text: 'Comprend vos questions orales ou écrites en langage de tous les jours.',
    tone: 'bg-blue-50 text-brand',
  },
  {
    icon: Wand2,
    title: 'Réponses adaptées',
    text: 'Génère des réponses personnalisées selon votre situation.',
    tone: 'bg-purple-50 text-purple-600',
  },
  {
    icon: FileCheck2,
    title: 'Simplification',
    text: 'Rédige et simplifie vos pièces justificatives complexes.',
    tone: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: ShieldCheck,
    title: 'Guidage fiable',
    text: 'Vous oriente vers la bonne administration en toute confiance.',
    tone: 'bg-indigo-50 text-indigo-600',
  },
];

/**
 * "IA générative" — structural twin of the reference design-to-code Mistral
 * panel. Presentational: the prompt chips illustrate the assistant's range
 * rather than triggering it directly, since starting a specific conversation
 * from here would require piping a canned prompt through `useChatbot`, which
 * the reference doesn't model either (`Génération en cours…` is decorative).
 */
export function LandingAI() {
  return (
    <section className="bg-background">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-8 shadow-lg">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <img src="/mistral-logo.svg" alt="Mistral AI" className="h-6 w-auto object-contain" />
              <span className="text-sm font-bold text-ink">Moteur IA Mistral</span>
            </div>
            <span className="rounded-full border border-chart-2/30 bg-chart-2/10 px-3 py-1 text-xs font-semibold text-chart-2">
              Temps réel
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {PROMPT_CHIPS.map((p) => (
              <div
                key={p.text}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface p-3 text-left text-xs font-semibold text-ink"
              >
                <span className="flex items-center gap-2">
                  <p.icon className={`size-4 ${p.tone}`} aria-hidden="true" />
                  {p.text}
                </span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-brand/15 bg-brand-soft/50 p-4 text-xs">
            <div className="flex items-center justify-between font-semibold text-brand">
              <span>Génération en cours...</span>
              <Sparkles className="size-4 animate-spin" aria-hidden="true" />
            </div>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              « Voici une explication simple de vos droits APL auprès de la CAF : selon votre
              contrat locatif et votre avis d’imposition… »
            </p>
          </div>
        </div>

        <div>
          <p className="eyebrow">IA générative</p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            Une intelligence au service de votre quotidien
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            Grâce à l’IA générative, Administral comprend vos demandes en langage naturel et vous
            apporte des réponses claires, personnalisées et fiables.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {IA_FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${f.tone}`}>
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink">{f.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
