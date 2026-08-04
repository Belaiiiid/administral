import { ArrowRight, CheckCircle2, Edit3, FileCheck2, FileText, MessageSquare, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';

import { Reveal } from '@/features/chatbot/components/landing/Reveal';

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
    // `id="ia"` — the header's "IA générative" link targets `#ia` and had
    // nothing to scroll to until now.
    <section id="ia" className="relative overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute -left-32 top-1/4 size-96 rounded-full bg-brand/5 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-chart-2/5 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
        <Reveal from="left">
          <div className="group relative overflow-hidden rounded-sm border border-border/60 bg-card p-8 shadow-lg transition-shadow duration-500 hover:shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-4">
              <div className="flex items-center gap-3">
                <img src="/mistral-logo.svg" alt="Mistral AI" className="h-7 w-auto object-contain" />
                <span className="text-base font-bold text-ink">Moteur IA Mistral</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-chart-2/30 bg-chart-2/10 px-3 py-1 text-sm font-semibold text-chart-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-chart-2 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-chart-2" />
                </span>
                Temps réel
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {PROMPT_CHIPS.map((p, i) => (
                <div
                  key={p.text}
                  style={{ transitionDelay: `${i * 60}ms` }}
                  className="group/chip flex w-full items-center justify-between gap-2 rounded-sm border border-border/60 bg-surface p-3.5 text-left text-sm font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand-soft/40 hover:shadow-md"
                >
                  <span className="flex items-center gap-2.5">
                    <p.icon className={`size-4.5 ${p.tone}`} aria-hidden="true" />
                    {p.text}
                  </span>
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform duration-300 group-hover/chip:translate-x-1 group-hover/chip:text-brand"
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-sm border border-brand/15 bg-brand-soft/50 p-4 text-sm">
              <div className="flex items-center justify-between font-semibold text-brand">
                <span>Génération en cours...</span>
                <Sparkles className="size-4 animate-spin" aria-hidden="true" />
              </div>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                « Voici une explication simple de vos droits APL auprès de la CAF : selon votre
                contrat locatif et votre avis d’imposition… »
              </p>
              {/* Typing bar — the panel read as a frozen screenshot without it. */}
              <span
                className="mt-3 block h-0.5 w-full overflow-hidden rounded-full bg-brand/10"
                aria-hidden="true"
              >
                <span className="block h-full w-1/3 animate-[shimmer_2s_ease-in-out_infinite] rounded-full bg-brand/50" />
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal from="right">
          <p className="eyebrow text-sm">IA générative</p>
          <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
            Une intelligence au service de votre quotidien
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Grâce à l’IA générative, Administral comprend vos demandes en langage naturel et vous
            apporte des réponses claires, personnalisées et fiables.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {IA_FEATURES.map((f) => (
              <div
                key={f.title}
                className="group flex items-start gap-4 rounded-sm border border-transparent p-3 transition-all duration-300 hover:border-border/60 hover:bg-surface hover:shadow-sm"
              >
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-sm transition-transform duration-300 group-hover:scale-110 ${f.tone}`}
                >
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-base font-bold text-ink">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
